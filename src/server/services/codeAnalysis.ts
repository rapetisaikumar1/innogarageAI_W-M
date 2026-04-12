import { GoogleGenerativeAI, ChatSession } from '@google/generative-ai'

let genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

// Per-user code analysis sessions keyed by userId
const codeAnalysisSessions = new Map<string, ChatSession>()

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
  lines.push('Analyze the visible content and provide code suggestions that help the candidate.')
  lines.push('')
  lines.push('### Rules:')
  lines.push('1. **Detect coding content** — Look for IDEs, code editors, terminals, browser dev tools, coding platforms (LeetCode, HackerRank, CodeSignal, etc.).')
  lines.push('2. **Understand the problem** — Read visible problem statements, error messages, existing code, and test cases.')
  lines.push('3. **Provide COMPLETE code** — Always provide a full, working code snippet. Never partial code or pseudocode.')
  lines.push('4. **Match the language** — Use the same programming language visible on screen.')
  lines.push('5. **Be contextual** — If you can see the cursor position or where they\'re typing, provide code that fits that exact location.')
  lines.push('6. **Handle errors** — If you see error messages or failing tests, provide the fix.')
  lines.push('7. **Improve existing code** — If code is visible but suboptimal, suggest improvements.')
  lines.push('8. **Track changes** — Remember previous screens and track the candidate\'s progress.')
  lines.push('')
  lines.push('### Response Format:')
  lines.push('Always respond with ONLY a valid JSON object (no markdown wrapping):')
  lines.push('{')
  lines.push('  "detected": boolean,       // true if coding content was found on screen')
  lines.push('  "language": string,         // detected programming language (e.g., "python", "javascript", "java")')
  lines.push('  "context": string,          // brief description of what\'s on screen (max 100 chars)')
  lines.push('  "suggestion": string,       // the COMPLETE code snippet — use \\n for newlines')
  lines.push('  "explanation": string        // 1-2 sentence explanation of the suggestion')
  lines.push('}')
  lines.push('')
  lines.push('If no coding content is detected on screen, return: {"detected": false, "language": "", "context": "No coding content detected", "suggestion": "", "explanation": ""}')

  return lines.join('\n')
}

export async function initCodeAnalysisSession(userId: string, ctx: CodeAnalysisContext): Promise<void> {
  const ai = getGenAI()
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: buildCodeAnalysisPrompt(ctx),
    generationConfig: {
      // @ts-ignore — thinkingConfig supported in gemini-2.5-flash
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json'
    }
  })

  const chat = model.startChat({ history: [] })
  codeAnalysisSessions.set(userId, chat)
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
  const session = codeAnalysisSessions.get(userId)
  if (!session) {
    throw new Error('No active code analysis session. Please start an interview first.')
  }

  const result = await session.sendMessage([
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image
      }
    },
    { text: 'Analyze the screen content and provide code suggestions.' }
  ])

  const text = result.response.text().trim()
  try {
    return JSON.parse(text) as CodeSuggestionResult
  } catch {
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
  codeAnalysisSessions.delete(userId)
}

export function hasCodeAnalysisSession(userId: string): boolean {
  return codeAnalysisSessions.has(userId)
}
