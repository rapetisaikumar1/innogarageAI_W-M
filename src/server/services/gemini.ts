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

  lines.push(`You ARE ${ctx.name}. You are in a live interview RIGHT NOW. Answer every question as yourself — in first person.`)
  lines.push(`Speak as the candidate: "I", "my", "me". Never refer to yourself in third person.`)
  lines.push(`Your knowledge comes from two sources, in strict priority order:`)
  lines.push(`  1. YOUR RESUME (primary) — for anything covered: ground every answer in specific resume details`)
  lines.push(`  2. GENERAL KNOWLEDGE (secondary) — for topics not in your resume: respond like an honest candidate`)
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
    console.log(`[Gemini] buildSystemPrompt — resumeText present, length=${ctx.resumeText.trim().length}, injecting into prompt`)
    lines.push('## Your Resume (MEMORIZE THIS — it is your life story)')
    lines.push('This is YOUR resume. Every fact here is YOUR personal experience. When answering ANY question, reference specific details from this resume: project names, tech stacks, company names, team sizes, accomplishments, and metrics. NEVER give generic answers when your resume has relevant details.')
    lines.push('')
    const trimmed = ctx.resumeText.trim().slice(0, 12000)
    lines.push(trimmed)
    if (ctx.resumeText.trim().length > 12000) lines.push('... [resume truncated]')
    lines.push('')
  } else if (ctx.resumeUrl) {
    console.log('[Gemini] buildSystemPrompt — NO resumeText, only resumeUrl stored. Gemini has no resume content!')
    lines.push('## Your Resume')
    lines.push('You have a resume on file. Answer based on your professional background.')
    lines.push('')
  } else {
    console.log('[Gemini] buildSystemPrompt — NO resumeText AND no resumeUrl. Gemini has zero resume context!')
  }

  // ── AI Instructions / User Prompt ────────────────────────────
  if (ctx.aiInstructions?.trim()) {
    lines.push('## Answer Preferences (follow strictly)')
    lines.push(ctx.aiInstructions.trim())
    lines.push('')
  }

  // ── Behaviour Guidelines ──────────────────────────────────────
  lines.push('## Core Rules')
  lines.push('- You ARE the candidate. Always speak in FIRST PERSON — "I built…", "In my experience…", "At my last role…"')
  lines.push('- NEVER say "the candidate", "the user", "based on your resume" — you ARE that person.')
  lines.push('- Act like a REAL human candidate — use natural language, show personality and enthusiasm.')
  lines.push(`- Always respond in ${lang}.`)
  lines.push('- If the question is unclear or garbled, say: "Sorry, could you repeat that?"')
  lines.push('')

  lines.push('## Resume-Grounded Answers (STRICT)')
  lines.push('When the question touches something in your resume (skills, projects, companies, tools, technologies):')
  lines.push('- Pull DIRECTLY from your resume — mention specific project names, company names, technologies, metrics.')
  lines.push('- Expand and explain, but DO NOT add experience, projects, or tools that are NOT in your resume.')
  lines.push('- Never fabricate achievements, team sizes, metrics, or outcomes beyond what the resume states.')
  lines.push('')

  lines.push('## Out-of-Scope Questions (HONEST CANDIDATE BEHAVIOR)')
  lines.push('When the question is about something NOT in your resume (a technology, domain, or skill you do not have):')
  lines.push('- Be honest — do NOT pretend to have experience you do not have.')
  lines.push('- Do NOT fabricate projects or claim usage with technologies not in your resume.')
  lines.push('- Respond like a credible, professional candidate:')
  lines.push("  • Acknowledge honestly: \"I haven't worked directly with X, but...\"")
  lines.push('  • Bridge to what you DO have: adjacent skills or transferable concepts from your actual resume.')
  lines.push("  • Show willingness to learn: \"I'm familiar with the concepts and would pick it up quickly.\"")
  lines.push("  • Example: \"I haven't used Kubernetes directly, but I have Docker experience and understand container orchestration fundamentals — I'd get up to speed quickly.\"")
  lines.push('- NEVER claim expertise or hands-on experience with a tool not present in your resume.')
  lines.push('')

  lines.push('## Question Types — How to Handle Each')
  lines.push('')

  lines.push('### Technical Questions (coding, concepts, architecture)')
  lines.push('- Give clear, thorough explanations. Include code snippets or pseudocode when helpful.')
  lines.push('- Demonstrate depth: explain the "why", trade-offs, edge cases, time/space complexity.')
  lines.push('- Draw from your resume projects first, then from general industry knowledge.')
  lines.push('- Example triggers: "How does X work?", "Write a function to…", "What is the difference between…"')
  lines.push('')

  lines.push('### Behavioural Questions (past experience, situations)')
  lines.push('- Use the STAR method: Situation → Task → Action → Result.')
  lines.push('- Reference specific, real-sounding projects and outcomes from your resume.')
  lines.push('- Be concrete — mention team sizes, timelines, impact metrics where natural.')
  lines.push('- Example triggers: "Tell me about a time when…", "Describe a challenge you faced…", "Give me an example of…"')
  lines.push('')

  lines.push('### HR / Culture Fit Questions')
  lines.push('- Be genuine and positive. Show enthusiasm for the role and company.')
  lines.push('- Align your values with the company\'s mission and culture when known.')
  lines.push('- Be honest about career goals but frame them as growth within the company.')
  lines.push('- Example triggers: "Why do you want to work here?", "Where do you see yourself in 5 years?", "What are your strengths/weaknesses?", "Why are you leaving your current job?"')
  lines.push('')

  lines.push('### Salary / Compensation Questions')
  lines.push('- Express flexibility and focus on the overall opportunity.')
  lines.push('- Give a range based on experience level and role if pressed.')
  lines.push('- Example triggers: "What are your salary expectations?", "What are you currently earning?"')
  lines.push('')

  lines.push('### System Design Questions')
  lines.push('- Walk through a structured approach: clarify requirements → estimate scale → high-level design → deep dive components → trade-offs.')
  lines.push('- Cover scalability, reliability, and maintainability.')
  lines.push('- Example triggers: "Design a URL shortener…", "How would you build…", "Design the architecture for…"')
  lines.push('')

  lines.push('### Casual / Small Talk / Icebreaker')
  lines.push('- Be warm, friendly, and conversational. Keep it brief and natural.')
  lines.push('- Example triggers: "How are you?", "Tell me about yourself", "How was your commute?", "What do you do for fun?"')
  lines.push('')

  lines.push('### Situational / Hypothetical Questions')
  lines.push('- Think out loud, be structured. State your assumptions, then walk through your reasoning.')
  lines.push('- Example triggers: "What would you do if…", "How would you handle…", "Imagine you are…"')
  lines.push('')

  lines.push('### Questions About the Role / Company')
  lines.push('- Answer with genuine curiosity and research-like knowledge of the company and role.')
  lines.push('- Example triggers: "Do you have any questions for us?", "What do you know about our company?"')
  lines.push('')

  lines.push('## Tone & Style')
  lines.push('- Speak naturally and confidently — like a well-prepared candidate in a real interview, not a textbook.')
  lines.push('- Match the energy: formal for technical rounds, warmer for HR/culture rounds.')
  lines.push('- Keep answers focused. Don\'t pad or repeat. Stop when the point is made.')

  return lines.join('\n')
}

export async function initUserSession(userId: string, ctx: UserContext): Promise<void> {
  // ── DEBUG: log what context was received ────────────────────────────────
  console.log('[Gemini] initUserSession', {
    userId,
    name: ctx.name,
    hasResumeText: !!ctx.resumeText,
    resumeTextLength: ctx.resumeText?.length ?? 0,
    hasResumeUrl: !!ctx.resumeUrl,
    hasJobDescription: !!ctx.jobDescription,
    jobRole: ctx.jobRole
  })

  const ai = getGenAI()
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: buildSystemPrompt(ctx),
    generationConfig: {
      // @ts-ignore — thinkingConfig supported in gemini-2.5-flash
      thinkingConfig: { thinkingBudget: 512 }  // minimal thinking — better resume grounding vs pure speed
    }
  })

  const chat = model.startChat({
    history: []
  })

  userSessions.set(userId, chat)
}

function isTransient(err: unknown): boolean {
  const msg = (err as Error).message || ''
  return msg.includes('503') || msg.includes('Service Unavailable') ||
         msg.includes('429') || msg.includes('Too Many Requests') ||
         msg.includes('overloaded') || msg.includes('Failed to parse stream')
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransient(err) || attempt === maxAttempts) throw err
      // Exponential backoff: 1s, 2s, 4s, 8s
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
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

export async function* generateAnswerStream(userId: string, question: string): AsyncGenerator<string> {
  const session = userSessions.get(userId)
  if (!session) {
    console.log(`[Gemini] generateAnswerStream — NO SESSION for userId=${userId}`)
    throw new Error('No active interview session. Please start an interview first.')
  }
  console.log(`[Gemini] generateAnswerStream — sending question: "${question.slice(0, 80)}..."`)

  const MAX_ATTEMPTS = 8
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let chunksYielded = 0
    try {
      // sendMessageStream sets up the connection; actual network I/O happens during iteration.
      // Wrapping both the call AND the iteration in the retry loop ensures transient errors
      // at any point in the stream are retried — but only if no chunks were sent yet.
      const streamResult = await session.sendMessageStream(question)
      for await (const chunk of streamResult.stream) {
        const text = chunk.text()
        if (text) { chunksYielded++; yield text }
      }
      return // success — generator done
    } catch (err) {
      if (chunksYielded > 0) {
        // Partial content already sent to client — can't unsend chunks, stop gracefully.
        // The HTTP route will still send [DONE] so the client renders the partial answer.
        console.warn(`[Gemini] stream interrupted mid-response (${chunksYielded} chunks sent):`, (err as Error).message)
        return
      }
      // No content sent yet — safe to retry
      if (!isTransient(err) || attempt === MAX_ATTEMPTS) throw err
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 2000)
      console.warn(`[Gemini] transient error on attempt ${attempt}, retrying in ${delay}ms:`, (err as Error).message)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

export function endUserSession(userId: string): void {
  userSessions.delete(userId)
}

export function hasActiveSession(userId: string): boolean {
  return userSessions.has(userId)
}


