import { FastifyInstance, FastifyRequest } from 'fastify'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { users, profiles } from '../db/schema'
import { authMiddleware, verifyToken } from '../middleware/auth'
import { DeepgramClient } from '@deepgram/sdk'
import { initUserSession, generateAnswer, endUserSession, hasActiveSession } from '../services/gemini'
import { initCodeAnalysisSession, analyzeScreenContent, endCodeAnalysisSession } from '../services/codeAnalysis'

interface AuthRequest extends FastifyRequest {
  user: { userId: string; email: string }
}

export async function interviewRoutes(app: FastifyInstance): Promise<void> {
  // ── Deepgram WebSocket proxy ──────────────────────────────────────────────
  // Renderer streams raw PCM → this endpoint → Deepgram Nova-3
  // JWT passed as ?token= query param (WebSocket can't set headers)
  app.get('/interview/stream', { websocket: true }, (socket, request) => {
    // Authenticate via query param token
    const token = (request.query as Record<string, string>).token
    if (!token) { socket.close(4001, 'Missing token'); return }

    let userId: string
    try {
      const decoded = verifyToken(token)
      userId = decoded.userId
    } catch {
      socket.close(4001, 'Invalid token')
      return
    }

    const apiKey = process.env.DEEPGRAM_API_KEY
    if (!apiKey) { socket.close(4002, 'Deepgram API key not configured'); return }

    request.log.info({ userId }, 'Deepgram stream started')

    // PCM audio buffered while Deepgram connection is still opening
    const audioBuffer: Buffer[] = []
    // eslint-disable-next-line prefer-const
    let dgConn: { readyState: number; sendMedia: (b: Buffer) => void; close: () => void } | null = null

    // Forward raw PCM from renderer → buffer or Deepgram
    socket.on('message', (data: Buffer) => {
      if (dgConn && dgConn.readyState === 1) {
        dgConn.sendMedia(data)
      } else {
        audioBuffer.push(data)
        // Cap buffer at ~6 seconds of audio (96 × 4096-sample chunks at 16kHz)
        if (audioBuffer.length > 96) audioBuffer.shift()
      }
    })

    socket.on('close', () => {
      request.log.info({ userId }, 'Renderer WebSocket closed — finishing Deepgram')
      dgConn?.close()
    })

    socket.on('error', (err) => {
      request.log.error({ err }, 'Renderer WebSocket error')
      dgConn?.close()
    })

    // Async IIFE — @fastify/websocket v11 requires a sync handler signature
    ;(async () => {
      const deepgram = new DeepgramClient({ apiKey })

      // connect() creates the V1Socket; socket.connect() opens the WebSocket
      const conn = await deepgram.listen.v1.connect({
        model: 'nova-3',
        language: 'en',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1200,          // 1.2 s of silence → UtteranceEnd — faster response without cutting speech
        endpointing: 300,                // 300 ms silence → speech_final within an utterance
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
        Authorization: `Token ${apiKey}`
      })

      // Accumulate all is_final words until UtteranceEnd fires
      let utteranceBuffer = ''

      conn.on('open', () => {
        request.log.info({ userId }, 'Deepgram WS open — flushing buffer')
        dgConn = conn
        // Flush audio that arrived before Deepgram was ready
        for (const chunk of audioBuffer) conn.sendMedia(chunk)
        audioBuffer.length = 0
      })

      conn.on('message', (msg) => {
        const msgType = (msg as { type?: string }).type

        if (msgType === 'Results') {
          const result = msg as {
            type: string
            channel?: { alternatives?: Array<{ transcript?: string }> }
            is_final?: boolean
            speech_final?: boolean
          }
          const transcript = result.channel?.alternatives?.[0]?.transcript ?? ''
          if (!transcript) return

          if (result.is_final) {
            // Accumulate finalized words into utterance buffer
            utteranceBuffer += (utteranceBuffer ? ' ' : '') + transcript

            // speech_final fires at endpointing (300ms silence) — send immediately.
            // This fires ~900ms BEFORE UtteranceEnd (utterance_end_ms=1200ms),
            // giving Gemini a 900ms head-start and eliminating the main latency gap.
            if (result.speech_final) {
              const fullText = utteranceBuffer.trim()
              utteranceBuffer = ''
              if (fullText && socket.readyState === 1) {
                request.log.info({ userId, text: fullText }, 'speech_final — sending utterance')
                socket.send(JSON.stringify({
                  type: 'transcript',
                  text: fullText,
                  isFinal: true,
                  speechFinal: true
                }))
              }
            }
          } else {
            // Interim results — forward for live display only
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({
                type: 'transcript',
                text: transcript,
                isFinal: false,
                speechFinal: false
              }))
            }
          }
        } else if (msgType === 'UtteranceEnd') {
          // Fallback: flush any buffer that speech_final didn't already send.
          // Handles edge cases such as is_final firing without speech_final.
          const fullText = utteranceBuffer.trim()
          utteranceBuffer = ''
          if (fullText && socket.readyState === 1) {
            request.log.info({ userId, text: fullText }, 'UtteranceEnd fallback — sending remaining buffer')
            socket.send(JSON.stringify({
              type: 'transcript',
              text: fullText,
              isFinal: true,
              speechFinal: true
            }))
          }
        }
      })

      conn.on('error', (err) => {
        request.log.error({ err }, 'Deepgram error')
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'error', message: String(err) }))
        }
      })

      conn.on('close', () => {
        request.log.info({ userId }, 'Deepgram connection closed')
      })

      // Actually open the WebSocket (V1Client.connect() only creates the socket)
      conn.connect()
    })().catch((err) => {
      request.log.error({ err }, 'Failed to initialize Deepgram connection')
      try { socket.close(4003, 'Failed to connect to Deepgram') } catch { /* already closed */ }
    })
  })

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
