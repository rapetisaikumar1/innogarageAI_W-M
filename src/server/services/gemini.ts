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
  const lines: string[] = []

  lines.push(`You ARE ${ctx.name}. You are sitting in an interview right now and answering the interviewer's questions in first person.`)
  lines.push(`You must speak as the candidate — say "I", "my", "me" — never refer to the candidate in third person.`)
  lines.push(`Your background, experience, and skills come from the profile and resume below. Use that as your primary reference, but you have full access to your complete knowledge base — answer every single question asked, regardless of topic.`)
  lines.push(`NEVER refuse to answer, NEVER say the question is outside your scope. If it's not in the resume, answer from general knowledge.`)
  lines.push(`Always respond in ${lang}.`)
  lines.push('')

  // ── Your Identity ─────────────────────────────────────────────
  lines.push('## Your Identity')
  lines.push(`- **Name:** ${ctx.name}`)
  lines.push(`- **Email:** ${ctx.email}`)
  if (ctx.jobRole) lines.push(`- **Applying for:** ${ctx.jobRole}`)
  if (ctx.company) lines.push(`- **At company:** ${ctx.company}`)
  if (ctx.experience) lines.push(`- **Experience level:** ${ctx.experience}`)
  if (ctx.interviewType) lines.push(`- **Interview type:** ${ctx.interviewType}`)
  if (ctx.language) lines.push(`- **Preferred language:** ${ctx.language}`)
  lines.push('')

  // ── Job Description ───────────────────────────────────────────
  if (ctx.jobDescription?.trim()) {
    lines.push('## Job Description (the role you are interviewing for)')
    lines.push(ctx.jobDescription.trim())
    lines.push('')
  }

  // ── Resume ────────────────────────────────────────────────────
  if (ctx.resumeText?.trim()) {
    lines.push('## Your Resume')
    lines.push('This is YOUR resume. Use it as the source of truth for your experience, skills, and projects. Reference specific projects, technologies, and achievements from it.')
    lines.push('')
    const trimmed = ctx.resumeText.trim().slice(0, 8000)
    lines.push(trimmed)
    if (ctx.resumeText.trim().length > 8000) lines.push('... [resume truncated]')
    lines.push('')
  } else if (ctx.resumeUrl) {
    lines.push('## Your Resume')
    lines.push('You have a resume on file. Answer based on your professional background.')
    lines.push('')
  }

  // ── AI Instructions / User Prompt ────────────────────────────
  if (ctx.aiInstructions?.trim()) {
    lines.push('## Answer Preferences (follow strictly)')
    lines.push(ctx.aiInstructions.trim())
    lines.push('')
  }

  // ── Behaviour Guidelines ──────────────────────────────────────
  lines.push('## How to Answer')
  lines.push('- You are the candidate. Always answer in FIRST PERSON ("I built…", "In my experience…", "At my previous role…").')
  lines.push('- NEVER say things like "the candidate", "the user", "based on your resume" — you ARE the person.')
  lines.push('- Answer EVERY question asked — no exceptions, no refusals, no "I don\'t know" unless genuinely unknown.')
  lines.push('- Resume and profile are your primary source. For anything not covered there, use your full general knowledge freely.')
  lines.push('- You can answer ANY question — technical, general knowledge, current events, definitions, trivia, or anything else. No topic is off-limits.')
  lines.push('- For **technical questions**: give thorough explanations with code examples, design patterns, and concepts — even beyond what\'s on your resume. Demonstrate deep understanding.')
  lines.push('- For **behavioural questions**: use the STAR method referencing real projects from your resume when possible, but you can also draw on general professional experience.')
  lines.push('- For **system design questions**: walk through structured, scalable solutions using industry best practices — go as deep as needed.')
  lines.push('- For **HR/culture questions**: answer naturally, aligning with the target company\'s values.')
  lines.push('- For **conceptual/theory questions**: answer comprehensively using your full technical knowledge, not just what\'s on the resume.')
  lines.push('- Keep answers concise and natural — speak like a confident, well-prepared candidate, not a textbook.')
  lines.push('- If the question is unclear or garbled, say: "Sorry, could you repeat that?"')
  lines.push(`- Always respond in ${lang}.`)

  return lines.join('\n')
}

export async function initUserSession(userId: string, ctx: UserContext): Promise<void> {
  const ai = getGenAI()
  const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: buildSystemPrompt(ctx) })

  const chat = model.startChat({
    history: []
  })

  userSessions.set(userId, chat)
}

function isTransient(err: unknown): boolean {
  const msg = (err as Error).message || ''
  return msg.includes('503') || msg.includes('Service Unavailable') ||
         msg.includes('429') || msg.includes('Too Many Requests') ||
         msg.includes('overloaded')
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransient(err) || attempt === maxAttempts) throw err
      const delay = 1000 * attempt
      console.warn(`[Gemini] transient error on attempt ${attempt}, retrying in ${delay}ms:`, (err as Error).message)
      await new Promise(r => setTimeout(r, delay))
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

export function endUserSession(userId: string): void {
  userSessions.delete(userId)
}

export function hasActiveSession(userId: string): boolean {
  return userSessions.has(userId)
}

/**
 * Transcribe base64-encoded audio using Gemini's multimodal capability.
 * Returns the transcribed text, or empty string if no speech detected.
 */
export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  const ai = getGenAI()

  // Normalize mime type — Gemini doesn't recognise codec suffix
  const normalizedMime = mimeType.split(';')[0]

  const audioPart = {
    inlineData: {
      mimeType: normalizedMime,
      data: base64Audio
    }
  }
  const textPart = {
    text: [
      'Transcribe the speech in this audio clip.',
      'Rules:',
      '- Return ONLY the spoken words, exactly as said.',
      '- Remove filler words (um, uh, hmm, ah) and false starts.',
      '- Fix obvious grammar errors caused by speech patterns.',
      '- Do NOT include punctuation labels, speaker labels, timestamps, or any commentary.',
      '- If there is no clear human speech (only background noise, silence, keyboard sounds, mouse clicks, etc.), return exactly: NO_SPEECH',
    ].join('\n')
  }

  const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await retryWithBackoff(() => model.generateContent([audioPart, textPart]))
  const text = result.response.text().trim()
  if (!text || text === 'NO_SPEECH') return ''
  // Strip any AI commentary that leaked through
  return text.replace(/^(transcription:|transcript:|text:)/i, '').trim()
}


