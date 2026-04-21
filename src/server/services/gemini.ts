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

// Per-user chat sessions keyed by userId
const userSessions = new Map<string, ChatSession>()

interface UserContext {
  name: string
  email: string
  resumeUrl: string | null
  resumeText: string | null
  jobDescription: string | null
  jobRole: string | null
  experience: string | null
  interviewType: string | null
  company: string | null
  language: string | null
  aiInstructions: string | null
}

function buildSystemPrompt(ctx: UserContext): string {
  const lang = ctx.language || 'English'
  const parts: string[] = []

  // ── Core identity (one line) ───────────────────────────────────
  const role = [ctx.jobRole, ctx.company ? `at ${ctx.company}` : ''].filter(Boolean).join(' ')
  parts.push(`You ARE ${ctx.name}, currently in a live job interview${role ? ` for ${role}` : ''}. Answer every question as yourself in first person ("I", "my", "me"). Always respond in ${lang}.`)
  parts.push('')

  const meta = [
    ctx.experience ? `Experience: ${ctx.experience}` : '',
    ctx.interviewType ? `Round: ${ctx.interviewType}` : ''
  ].filter(Boolean).join(' | ')
  if (meta) { parts.push(meta); parts.push('') }

  // ── Job description (capped at 1200 chars) ────────────────────
  if (ctx.jobDescription?.trim()) {
    parts.push('## Job Description')
    parts.push(ctx.jobDescription.trim().slice(0, 1200))
    parts.push('')
  }

  // ── Resume (capped at 4000 chars — covers key sections) ───────
  if (ctx.resumeText?.trim()) {
    const resumeSnippet = ctx.resumeText.trim()
    console.log(`[Gemini] buildSystemPrompt — resumeText length=${resumeSnippet.length}, using first 4000 chars`)
    parts.push('## Your Resume (every fact here is YOUR personal experience)')
    parts.push(resumeSnippet.slice(0, 4000))
    if (resumeSnippet.length > 4000) parts.push('[...resume continues]')
    parts.push('')
  } else if (ctx.resumeUrl) {
    console.log('[Gemini] buildSystemPrompt — no resumeText, only resumeUrl')
  } else {
    console.log('[Gemini] buildSystemPrompt — no resume at all')
  }

  // ── Compact rules ─────────────────────────────────────────────
  parts.push('## Rules')
  parts.push('- Ground every answer in your resume: name specific projects, companies, tools, metrics.')
  parts.push("- If asked about something not in your resume, be honest and bridge to adjacent skills you do have.")
  parts.push('- Behavioural: use STAR. Technical: show depth and trade-offs. HR: be genuine. Unclear question: ask for clarification.')
  parts.push('- Keep answers focused — stop when the point is made.')

  if (ctx.aiInstructions?.trim()) {
    parts.push('')
    parts.push('## Additional Instructions')
    parts.push(ctx.aiInstructions.trim())
  }

  return parts.join('\n')
}

export interface HistoryTurn {
  question: string
  answer: string
}

// Only keep last N turns in chat history to avoid token bloat
const RECENT_TURNS = 6  // 3 Q&A pairs

export async function initUserSession(userId: string, ctx: UserContext, history: HistoryTurn[] = []): Promise<void> {
  console.log('[Gemini] initUserSession', {
    userId,
    name: ctx.name,
    hasResumeText: !!ctx.resumeText,
    resumeTextLength: ctx.resumeText?.length ?? 0,
    jobRole: ctx.jobRole,
    historyTurns: history.length
  })

  const ai = getGenAI()
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: buildSystemPrompt(ctx),
    generationConfig: {
      // @ts-ignore — thinkingConfig supported in gemini-2.5-flash
      thinkingConfig: { thinkingBudget: 0 }
    }
  })

  // Build compact chat history:
  // - Older turns (beyond RECENT_TURNS) become a single compressed summary block
  // - Only the last RECENT_TURNS turns are passed verbatim
  type ChatPart = { role: 'user' | 'model'; parts: [{ text: string }] }
  const chatHistory: ChatPart[] = []

  if (history.length > RECENT_TURNS) {
    const older = history.slice(0, history.length - RECENT_TURNS)
    const summaryLines = older
      .map(t => `Q: ${t.question.slice(0, 120)}\nA: ${t.answer.slice(0, 300)}`)
      .join('\n---\n')
    chatHistory.push({ role: 'user', parts: [{ text: `[Earlier conversation summary]\n${summaryLines}` }] })
    chatHistory.push({ role: 'model', parts: [{ text: 'Understood, I have that context from our earlier discussion.' }] })
  }

  for (const turn of history.slice(-RECENT_TURNS)) {
    chatHistory.push({ role: 'user', parts: [{ text: turn.question }] })
    chatHistory.push({ role: 'model', parts: [{ text: turn.answer }] })
  }

  const chat = model.startChat({ history: chatHistory })
  userSessions.set(userId, chat)
}

function isTransient(err: unknown): boolean {
  const msg = (err as Error).message || ''
  return msg.includes('503') || msg.includes('Service Unavailable') ||
         msg.includes('429') || msg.includes('Too Many Requests') ||
         msg.includes('overloaded') || msg.includes('Failed to parse stream')
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransient(err) || attempt === maxAttempts) throw err
      console.warn(`[Gemini] transient error on attempt ${attempt}, retrying in 1000ms:`, (err as Error).message)
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  throw lastErr
}

export async function generateAnswer(userId: string, question: string): Promise<string> {
  const session = userSessions.get(userId)
  if (!session) {
    throw new Error('No active interview session. Please start an interview first.')
  }

  const result = await retryWithBackoff(() => session.sendMessage(question))
  return result.response.text()
}

export async function* generateAnswerStream(userId: string, question: string): AsyncGenerator<string> {
  const session = userSessions.get(userId)
  if (!session) {
    throw new Error('No active interview session. Please start an interview first.')
  }

  const result = await session.sendMessageStream(question)
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
  }
}

export function endUserSession(userId: string): void {
  userSessions.delete(userId)
}

export function hasActiveSession(userId: string): boolean {
  return userSessions.has(userId)
}


