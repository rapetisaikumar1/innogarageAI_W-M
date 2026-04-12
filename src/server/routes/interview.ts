import { FastifyInstance, FastifyRequest } from 'fastify'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { users, profiles } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { initUserSession, generateAnswer, endUserSession, hasActiveSession, transcribeAudio } from '../services/gemini'
import { initCodeAnalysisSession, analyzeScreenContent, endCodeAnalysisSession } from '../services/codeAnalysis'

interface AuthRequest extends FastifyRequest {
  user: { userId: string; email: string }
}

export async function interviewRoutes(app: FastifyInstance): Promise<void> {
  // Start interview session — initializes Gemini with user context
  app.post('/interview/start', { preHandler: authMiddleware }, async (request, reply) => {
    const { userId } = (request as AuthRequest).user

    const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1)
    const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1)

    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }

    await initUserSession(userId, {
      name: user.name,
      email: user.email,
      resumeUrl: profile?.resumeUrl ?? null,
      resumeText: profile?.resumeText ?? null,
      jobDescription: profile?.jobDescription ?? null,
      jobRole: profile?.jobRole ?? null,
      experience: profile?.experience ?? null,
      interviewType: profile?.interviewType ?? null,
      company: profile?.company ?? null,
      language: profile?.language ?? null,
      aiInstructions: profile?.aiInstructions ?? null
    })

    // Initialize code analysis session with user context
    await initCodeAnalysisSession(userId, {
      name: user.name,
      resumeText: profile?.resumeText ?? null,
      jobDescription: profile?.jobDescription ?? null,
      jobRole: profile?.jobRole ?? null,
      experience: profile?.experience ?? null,
      interviewType: profile?.interviewType ?? null,
      company: profile?.company ?? null,
      language: profile?.language ?? null,
      aiInstructions: profile?.aiInstructions ?? null
    })

    return { message: 'Interview session started', active: true }
  })

  // Send transcribed text → get AI answer
  app.post('/interview/ask', { preHandler: authMiddleware }, async (request, reply) => {
    const { userId } = (request as AuthRequest).user
    const { text } = request.body as { text: string }

    if (!text?.trim()) {
      return reply.code(400).send({ error: 'Text is required' })
    }

    if (!hasActiveSession(userId)) {
      return reply.code(400).send({ error: 'No active interview session' })
    }

    try {
      const answer = await generateAnswer(userId, text.trim())
      return { question: text.trim(), answer }
    } catch (err) {
      request.log.error({ err }, 'generateAnswer failed')
      return reply.code(503).send({ error: 'AI service temporarily unavailable. Please try again.' })
    }
  })

  // End interview session
  app.post('/interview/end', { preHandler: authMiddleware }, async (request) => {
    const { userId } = (request as AuthRequest).user
    endUserSession(userId)
    endCodeAnalysisSession(userId)
    return { message: 'Interview session ended' }
  })

  // Check if session is active
  app.get('/interview/status', { preHandler: authMiddleware }, async (request) => {
    const { userId } = (request as AuthRequest).user
    return { active: hasActiveSession(userId) }
  })

  // Transcribe audio chunk via Gemini multimodal
  app.post('/interview/transcribe', { preHandler: authMiddleware }, async (request, reply) => {
    const { audio, mimeType } = request.body as { audio: string; mimeType: string }

    if (!audio) {
      return reply.code(400).send({ error: 'audio is required' })
    }

    request.log.info({ mimeType, audioLen: audio.length }, 'Transcription request received')

    try {
      const text = await transcribeAudio(audio, mimeType || 'audio/webm')
      request.log.info({ text: text.slice(0, 100) }, 'Transcription result')
      return { text }
    } catch (err) {
      request.log.error({ err }, 'Transcription failed')
      return reply.code(500).send({ error: 'Transcription failed', details: (err as Error).message })
    }
  })

  // Analyze screen capture for code suggestions
  app.post('/interview/code-suggest', { preHandler: authMiddleware }, async (request, reply) => {
    const { userId } = (request as AuthRequest).user
    const { image } = request.body as { image: string }

    if (!image) {
      return reply.code(400).send({ error: 'image is required' })
    }

    request.log.info({ imageLen: image.length }, 'Code analysis request received')

    try {
      const result = await analyzeScreenContent(userId, image)
      request.log.info({ detected: result.detected, language: result.language }, 'Code analysis result')
      return result
    } catch (err) {
      request.log.error({ err }, 'Code analysis failed')
      return reply.code(500).send({ error: 'Code analysis failed', details: (err as Error).message })
    }
  })
}
