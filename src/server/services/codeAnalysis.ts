import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'

let genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

// Per-user stateless model instances — no chat history accumulation
// All context is baked into the system prompt; stateless calls keep latency flat
// regardless of how many screenshots have been analyzed in the session
const codeAnalysisModels = new Map<string, GenerativeModel>()

interface CodeAnalysisContext {
  name: string
  resumeText: string | null
  jobDescription: string | null
  jobRole: string | null
  experience: string | null
  interviewType: string | null
  company: string | null
  language: string | null
  aiInstructions: string | null
}

function buildCodeAnalysisPrompt(ctx: CodeAnalysisContext): string {
  const lines: string[] = []

  lines.push('You are an expert code analysis AI assistant helping a candidate during a live technical interview.')
  lines.push('Your job is to analyze screenshots of the candidate\'s screen and provide relevant, ready-to-use code suggestions.')
  lines.push('')

  // ── Candidate Profile Summary ─────────────────────────────────
  lines.push('## Candidate Profile')
  lines.push(`- **Name:** ${ctx.name}`)
  if (ctx.jobRole) lines.push(`- **Applying for:** ${ctx.jobRole}`)
  if (ctx.company) lines.push(`- **Company:** ${ctx.company}`)
  if (ctx.experience) lines.push(`- **Experience level:** ${ctx.experience}`)
  if (ctx.interviewType) lines.push(`- **Interview type:** ${ctx.interviewType}`)
  lines.push('')

  if (ctx.jobDescription?.trim()) {
    lines.push('## Job Description')
    lines.push(ctx.jobDescription.trim().slice(0, 3000))
    lines.push('')
  }

  if (ctx.resumeText?.trim()) {
    lines.push('## Resume / Technical Background')
    lines.push(ctx.resumeText.trim().slice(0, 4000))
    lines.push('')
  }

  if (ctx.aiInstructions?.trim()) {
    lines.push('## Custom Instructions')
    lines.push(ctx.aiInstructions.trim())
    lines.push('')
  }

  // ── Behaviour ────────────────────────────────────────────────
  lines.push('## Your Task')
  lines.push('You will receive periodic screenshots of the candidate\'s screen during the interview.')
  lines.push('Your goal is to detect whether a CODING PROBLEM or CODE EDITOR is visible, and if so, provide a complete working solution.')
  lines.push('')
  lines.push('### What counts as valid coding content (set detected=true):')
  lines.push('- A coding challenge platform: LeetCode, HackerRank, CodeSignal, Codeforces, GeeksForGeeks, HackerEarth, InterviewBit, Codility, TopCoder')
  lines.push('- A code editor or IDE with a programming problem or code being written: VS Code, IntelliJ, PyCharm, Eclipse, Vim, Neovim, Sublime Text, Jupyter Notebook')
  lines.push('- A terminal/shell with code compilation errors or a program being written')
  lines.push('- A browser showing a coding problem statement alongside a code editor')
  lines.push('')
  lines.push('### What does NOT count — set detected=false for ALL of these:')
  lines.push('- Interview assistant applications, AI coaching tools, audio/speech pipelines, transcription UIs, or any tool that is helping with the interview (like this very app)')
  lines.push('- Chat interfaces, messaging apps, email, documents, slides, spreadsheets')
  lines.push('- General websites, dashboards, social media, video players, settings screens')
  lines.push('- A blank screen, desktop, file explorer, or browser with no coding problem visible')
  lines.push('- Any screen that does not show a clearly identifiable programming problem or code being written')
  lines.push('')
  lines.push('### Step-by-step instructions when detected=true:')
  lines.push('1. **Read every character on screen** — Before generating anything, read ALL visible text verbatim: problem statements, existing code, variable names, method signatures, error messages, test cases, constraints, and examples. Do not guess or paraphrase.')
  lines.push('2. **Identify the exact problem** — Extract the full problem title, description, constraints, and input/output examples as written on screen.')
  lines.push('3. **Read existing code carefully** — If the user has started writing code, read every line including the class name, method name, parameters, return type, and any partial logic. Do not rename or change any part of the existing skeleton.')
  lines.push('4. **Detect the language** — Use the exact programming language visible on screen. Match its syntax precisely.')
  lines.push('5. **Provide a COMPLETE solution** — Write a full, working, copy-paste-ready solution that fits exactly into the visible code structure. If a method skeleton exists, fill it in. If a class is defined, keep it.')
  lines.push('6. **Fix errors** — If you see compilation errors, runtime errors, or failing test cases, identify the exact cause and provide the corrected code.')
  lines.push('7. **No partial code** — Never return pseudocode, placeholders, incomplete snippets. Always return production-ready code.')
  lines.push('8. **Use optimal approach** — Provide the most efficient algorithm given the visible constraints (time/space complexity).')
  lines.push('')
  lines.push('### Response Format:')
  lines.push('Always respond with ONLY a valid JSON object. No markdown fences, no extra text:')
  lines.push('{')
  lines.push('  "detected": boolean,       // true ONLY if a coding problem or code editor with a problem is clearly visible')
  lines.push('  "language": string,         // detected programming language (e.g., "python", "javascript", "java", "c++")')
  lines.push('  "context": string,          // exact problem title or brief description of what is on screen (max 120 chars)')
  lines.push('  "suggestion": string,       // COMPLETE, working code — use \\n for newlines, use spaces for indentation')
  lines.push('  "explanation": string       // 1-3 sentence explanation of the approach and time/space complexity')
  lines.push('}')
  lines.push('')
  lines.push('If the screen does not show a coding problem or code editor, return EXACTLY: {"detected": false, "language": "", "context": "No coding content detected", "suggestion": "", "explanation": ""}')

  return lines.join('\n')
}

export async function initCodeAnalysisSession(userId: string, ctx: CodeAnalysisContext): Promise<void> {
  const ai = getGenAI()
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',  // lighter model for screen analysis — faster + lower quota usage
    systemInstruction: buildCodeAnalysisPrompt(ctx),
    generationConfig: {
      responseMimeType: 'application/json'
    }
  })

  codeAnalysisModels.set(userId, model)
}

export interface CodeSuggestionResult {
  detected: boolean
  language: string
  context: string
  suggestion: string
  explanation: string
}

export async function analyzeScreenContent(
  userId: string,
  base64Image: string
): Promise<CodeSuggestionResult> {
  const model = codeAnalysisModels.get(userId)
  if (!model) {
    throw new Error('No active code analysis session. Please start an interview first.')
  }

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image
      }
    },
    {
      text: [
        'Read this screenshot carefully.',
        '1. First, extract ALL visible text verbatim — problem statement, constraints, examples, existing code, class/method names, error messages.',
        '2. Then provide a complete, correct, copy-paste-ready solution that fits the exact code structure visible on screen.',
        '3. Return ONLY the JSON object as specified. No markdown, no extra text.'
      ].join('\n')
    }
  ])

  let raw = result.response.text().trim()
  console.log('[CodeAnalysis] raw Gemini response (first 500 chars):', raw.slice(0, 500))

  // Strip markdown code fences Gemini sometimes wraps around JSON
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    console.log('[CodeAnalysis] stripped markdown fences, retrying parse')
  }

  // If still no leading '{', try to extract first JSON object from the text
  if (!raw.startsWith('{')) {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      raw = match[0]
      console.log('[CodeAnalysis] extracted JSON object from response text')
    }
  }

  try {
    const parsed = JSON.parse(raw) as CodeSuggestionResult
    console.log('[CodeAnalysis] parsed OK — detected:', parsed.detected, 'language:', parsed.language, 'suggestion length:', parsed.suggestion?.length ?? 0)

    // Safety guard: reject if Gemini incorrectly detects non-coding UI as coding content.
    // Matches context strings that indicate interview tools, audio pipelines, or app UIs.
    if (parsed.detected) {
      const ctx = (parsed.context ?? '').toLowerCase()
      const nonCodingPatterns = [
        'interview', 'transcript', 'audio', 'microphone', 'recording', 'speech',
        'assistant', 'ai coach', 'suggestion panel', 'pipeline', 'dashboard',
        'sign in', 'login', 'profile', 'settings', 'upgrade', 'plan', 'billing',
        'innogarage', 'copilot', 'overlay'
      ]
      const isNonCoding = nonCodingPatterns.some(p => ctx.includes(p))
      if (isNonCoding) {
        console.log('[CodeAnalysis] safety guard triggered — context looks like app UI, not a coding problem:', parsed.context)
        return { detected: false, language: '', context: 'No coding content detected', suggestion: '', explanation: '' }
      }
    }

    return parsed
  } catch (err) {
    console.error('[CodeAnalysis] JSON parse failed after all attempts. Raw response:', raw.slice(0, 300), 'Error:', err)
    return {
      detected: false,
      language: '',
      context: 'Could not parse AI response',
      suggestion: '',
      explanation: ''
    }
  }
}

export function endCodeAnalysisSession(userId: string): void {
  codeAnalysisModels.delete(userId)
}

export function hasCodeAnalysisSession(userId: string): boolean {
  return codeAnalysisModels.has(userId)
}
