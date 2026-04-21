import { GoogleGenAI, Chat } from '@google/genai'

let genAI: GoogleGenAI | null = null

function getGenAI(): GoogleGenAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
    genAI = new GoogleGenAI({ apiKey })
  }
  return genAI
}

// Per-user session data: chat + ctx + clean history (only completed Q&A pairs)
interface UserSessionData {
  chat: Chat
  ctx: UserContext
  history: HistoryTurn[]
}

const userSessions = new Map<string, UserSessionData>()

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

// Builds a fresh Chat from ctx + clean history (no side effects)
function buildChatSession(ctx: UserContext, history: HistoryTurn[]): Chat {
  const ai = getGenAI()

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

  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: buildSystemPrompt(ctx),
      thinkingConfig: { thinkingBudget: 0 }
    },
    history: chatHistory
  })
}

// Replaces a corrupted chat session with a fresh one built from stored clean history
function rebuildChatSession(userId: string): void {
  const data = userSessions.get(userId)
  if (!data) return
  data.chat = buildChatSession(data.ctx, data.history)
}

export async function initUserSession(userId: string, ctx: UserContext, history: HistoryTurn[] = []): Promise<void> {
  console.log('[Gemini] initUserSession', {
    userId,
    name: ctx.name,
    hasResumeText: !!ctx.resumeText,
    resumeTextLength: ctx.resumeText?.length ?? 0,
    jobRole: ctx.jobRole,
    historyTurns: history.length
  })

  const chat = buildChatSession(ctx, history)
  userSessions.set(userId, { chat, ctx, history: [...history] })
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
      const delay = 600 * attempt  // 600ms, 1200ms, ...
      console.warn(`[Gemini] transient error on attempt ${attempt}, retrying in ${delay}ms:`, (err as Error).message)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}

// Wraps a promise with a wall-clock timeout
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!))
}

const STREAM_TIMEOUT_MS = 15_000
const MAX_STREAM_ATTEMPTS = 3
const STREAM_BACKOFF_MS = [0, 600, 1500]

export async function generateAnswer(userId: string, question: string): Promise<string> {
  const data = userSessions.get(userId)
  if (!data) {
    throw new Error('No active interview session. Please start an interview first.')
  }
  const result = await retryWithBackoff(() => data.chat.sendMessage({ message: question }))
  return result.text ?? ''
}

export async function* generateAnswerStream(
  userId: string,
  question: string,
  utteranceId?: string
): AsyncGenerator<string> {
  const data = userSessions.get(userId)
  if (!data) {
    throw new Error('No active interview session. Please start an interview first.')
  }

  let accumulatedAnswer = ''

  // Stream with exponential backoff retry — rebuild chat session on each retry
  // to avoid using a corrupted session after a previous failure
  for (let attempt = 1; attempt <= MAX_STREAM_ATTEMPTS; attempt++) {
    const delay = STREAM_BACKOFF_MS[attempt - 1] ?? 1500
    if (delay > 0) {
      console.warn(`[Gemini] stream retry attempt ${attempt}/${MAX_STREAM_ATTEMPTS} in ${delay}ms`, { userId, utteranceId })
      await new Promise(r => setTimeout(r, delay))
      // Rebuild a fresh chat session from clean history before retrying
      console.log('[Gemini] rebuilding chat session before retry', { userId, utteranceId, attempt })
      rebuildChatSession(userId)
    }

    let chunksYielded = 0
    accumulatedAnswer = ''  // reset for this attempt
    try {
      const streamResult = await withTimeout(
        data.chat.sendMessageStream({ message: question }),
        STREAM_TIMEOUT_MS,
        'sendMessageStream'
      )
      for await (const chunk of streamResult) {
        const text = chunk.text
        if (text) { chunksYielded++; accumulatedAnswer += text; yield text }
      }
      // Success — persist completed Q&A to clean history
      data.history.push({ question, answer: accumulatedAnswer })
      return

    } catch (err) {
      console.error('[Gemini] stream attempt failed', {
        userId,
        utteranceId,
        attempt,
        chunksYielded,
        error: (err as Error).message,
        stack: ((err as Error).stack ?? '').split('\n').slice(0, 5).join('\n')
      })
      // Mid-stream failure — try to continue with fallback model so user gets a complete answer
      if (chunksYielded > 0) {
        rebuildChatSession(userId)
        if (isTransient(err)) {
          console.warn('[Gemini] mid-stream failure, attempting continuation with fallback model', {
            userId, utteranceId, partialLength: accumulatedAnswer.length
          })
          try {
            const continuation = yield* continueWithFallbackModel(data, question, accumulatedAnswer, utteranceId)
            data.history.push({ question, answer: accumulatedAnswer + continuation })
            return
          } catch (contErr) {
            console.error('[Gemini] continuation also failed', {
              userId, utteranceId, error: (contErr as Error).message
            })
            // Persist partial answer so future history is consistent
            data.history.push({ question, answer: accumulatedAnswer })
            return  // user already saw partial answer; don't surface error
          }
        }
        throw err
      }
      // Permanent error — don't retry
      if (!isTransient(err)) throw err
      // More attempts remaining — loop will rebuild session and retry
      if (attempt < MAX_STREAM_ATTEMPTS) continue
    }
  }

  // Non-streaming fallback — all stream attempts exhausted
  // Rebuild once more so fallback uses a clean uncorrupted session
  console.warn('[Gemini] all stream attempts failed, falling back to sendMessage', { userId, utteranceId })
  rebuildChatSession(userId)
  try {
    const fallback = await withTimeout(
      retryWithBackoff(() => data.chat.sendMessage({ message: question }), 2),
      STREAM_TIMEOUT_MS,
      'sendMessage fallback'
    )
    const text = fallback.text ?? ''
    if (text) {
      data.history.push({ question, answer: text })
      yield text
      return
    }
  } catch (err) {
    console.warn('[Gemini] flash fallback also failed, trying flash-lite', {
      userId, utteranceId, error: (err as Error).message
    })
  }

  // Last resort — gemini-2.5-flash-lite (higher quota, rarely overloaded)
  try {
    const liteText = yield* askFallbackModel(data, question, utteranceId)
    if (liteText) {
      data.history.push({ question, answer: liteText })
      return
    }
    throw new Error('Empty response from fallback model')
  } catch (err) {
    console.error('[Gemini] flash-lite fallback also failed', {
      userId, utteranceId, error: (err as Error).message
    })
    throw new Error('The AI service is temporarily unavailable. Please try again.')
  }
}

// Streams a one-shot answer from gemini-2.5-flash-lite using the same system prompt + history
async function* askFallbackModel(
  data: UserSessionData,
  question: string,
  utteranceId?: string
): AsyncGenerator<string, string> {
  const ai = getGenAI()
  const contents = buildContentsFromHistory(data.history)
  contents.push({ role: 'user', parts: [{ text: question }] })

  console.log('[Gemini] using flash-lite fallback', { utteranceId, historyTurns: data.history.length })
  const stream = await withTimeout(
    ai.models.generateContentStream({
      model: 'gemini-2.5-flash-lite',
      config: {
        systemInstruction: buildSystemPrompt(data.ctx),
        thinkingConfig: { thinkingBudget: 0 }
      },
      contents
    }),
    STREAM_TIMEOUT_MS,
    'flash-lite generateContentStream'
  )

  let full = ''
  for await (const chunk of stream) {
    const text = chunk.text
    if (text) { full += text; yield text }
  }
  return full
}

// Continues a partial answer using flash-lite, prompting it to pick up where the stream broke
async function* continueWithFallbackModel(
  data: UserSessionData,
  question: string,
  partialAnswer: string,
  utteranceId?: string
): AsyncGenerator<string, string> {
  const ai = getGenAI()
  const contents = buildContentsFromHistory(data.history)
  contents.push({ role: 'user', parts: [{ text: question }] })
  contents.push({ role: 'model', parts: [{ text: partialAnswer }] })
  contents.push({ role: 'user', parts: [{ text: 'Please continue your previous response from exactly where it stopped. Do not repeat any text. Just continue mid-sentence if needed and finish your answer.' }] })

  console.log('[Gemini] continuing with flash-lite', { utteranceId, partialLength: partialAnswer.length })
  const stream = await withTimeout(
    ai.models.generateContentStream({
      model: 'gemini-2.5-flash-lite',
      config: {
        systemInstruction: buildSystemPrompt(data.ctx),
        thinkingConfig: { thinkingBudget: 0 }
      },
      contents
    }),
    STREAM_TIMEOUT_MS,
    'flash-lite continuation'
  )

  let full = ''
  for await (const chunk of stream) {
    const text = chunk.text
    if (text) { full += text; yield text }
  }
  return full
}

// Reuses the same compact-history approach as buildChatSession
function buildContentsFromHistory(history: HistoryTurn[]): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
  if (history.length > RECENT_TURNS) {
    const older = history.slice(0, history.length - RECENT_TURNS)
    const summaryLines = older
      .map(t => `Q: ${t.question.slice(0, 120)}\nA: ${t.answer.slice(0, 300)}`)
      .join('\n---\n')
    contents.push({ role: 'user', parts: [{ text: `[Earlier conversation summary]\n${summaryLines}` }] })
    contents.push({ role: 'model', parts: [{ text: 'Understood, I have that context from our earlier discussion.' }] })
  }
  for (const turn of history.slice(-RECENT_TURNS)) {
    contents.push({ role: 'user', parts: [{ text: turn.question }] })
    contents.push({ role: 'model', parts: [{ text: turn.answer }] })
  }
  return contents
}

export function endUserSession(userId: string): void {
  userSessions.delete(userId)
}

export function hasActiveSession(userId: string): boolean {
  return userSessions.has(userId)
}


