import { FastifyInstance, FastifyRequest } from 'fastify'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { users, profiles } from '../db/schema'
import { authMiddleware, verifyToken } from '../middleware/auth'
import { DeepgramClient } from '@deepgram/sdk'
import { initUserSession, generateAnswerStream, endUserSession, hasActiveSession, HistoryTurn } from '../services/gemini'
import { initCodeAnalysisSession, analyzeScreenContent, endCodeAnalysisSession } from '../services/codeAnalysis'
import { downloadCloudinaryRaw } from '../services/cloudinary'

interface AuthRequest extends FastifyRequest {
  user: { userId: string; email: string }
}

// Extract text from a PDF buffer using pdf-parse v2
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    await parser.destroy()
    return result.text.trim()
  } catch (err) {
    console.error('[extractPdfText] FAILED:', (err as Error).message)
    return ''
  }
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

    const toAudioFrame = (data: Buffer): ArrayBuffer => {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    }

    // PCM audio buffered while Deepgram connection is still opening
    const audioBuffer: ArrayBuffer[] = []
    // eslint-disable-next-line prefer-const
    let dgConn: { getReadyState: () => number; send: (b: ArrayBuffer) => void; requestClose: () => void } | null = null

    // Forward raw PCM from renderer → buffer or Deepgram (WebSocket is audio-only)
    socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary) return  // ignore non-binary frames
      const audioFrame = toAudioFrame(data)
      if (dgConn && dgConn.getReadyState() === 1) {
        dgConn.send(audioFrame)
      } else {
        audioBuffer.push(audioFrame)
        if (audioBuffer.length > 480) audioBuffer.shift()
      }
    })

    socket.on('close', () => {
      request.log.info({ userId }, 'Renderer WebSocket closed — finishing Deepgram')
      dgConn?.requestClose()
    })

    socket.on('error', (err) => {
      request.log.error({ err }, 'Renderer WebSocket error')
      dgConn?.requestClose()
    })

    // Async IIFE — @fastify/websocket v11 requires a sync handler signature
    ;(async () => {
      const deepgram = new DeepgramClient({ key: apiKey })

      // listen.live() constructs ListenLiveClient and connects immediately
      const conn = deepgram.listen.live({
        model: 'nova-3',
        language: 'en',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1200,          // 1.2 s of silence → UtteranceEnd fallback
        endpointing: 1000,               // 1000 ms silence → speech_final
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
        filler_words: true,              // capture "um", "uh" for natural transcript
        diarize: false,                  // single speaker — skip diarization overhead
        numerals: true,                  // convert spoken numbers to digits for accuracy
        no_delay: true,                  // minimize latency — send results as soon as available
        keywords: [],                    // can be populated per-user for domain-specific terms
      })

      // Accumulate all is_final words until UtteranceEnd fires
      let utteranceBuffer = ''

      conn.on('open', () => {
        request.log.info({ userId }, 'Deepgram WS open — flushing buffer')
        dgConn = conn
        // Flush audio that arrived before Deepgram was ready
        for (const chunk of audioBuffer) conn.send(chunk)
        audioBuffer.length = 0
      })

      conn.on('Results', (msg) => {
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
          if (result.speech_final) {
            const fullText = utteranceBuffer.trim()
            // Only clear buffer AFTER confirming the socket is open to send.
            // If socket is closed here, leave buffer for UtteranceEnd fallback.
            if (fullText && socket.readyState === 1) {
              utteranceBuffer = ''
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
      })

      conn.on('UtteranceEnd', () => {
        // Fallback: flush any buffer that speech_final didn't already send.
        const fullText = utteranceBuffer.trim()
        if (fullText && socket.readyState === 1) {
          request.log.info({ userId, text: fullText }, 'UtteranceEnd fallback — sending remaining buffer')
          socket.send(JSON.stringify({
            type: 'transcript',
            text: fullText,
            isFinal: true,
            speechFinal: true
          }))
          utteranceBuffer = ''
        } else {
          // Socket closed or nothing to send — just clear the buffer
          utteranceBuffer = ''
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

    // ── DEBUG: log what DB returned for this user ──────────────────────────
    request.log.info({
      userId,
      profileFound: !!profile,
      hasResumeText: !!profile?.resumeText,
      resumeTextLength: profile?.resumeText?.length ?? 0,
      hasResumeUrl: !!profile?.resumeUrl,
      hasJobDescription: !!profile?.jobDescription,
      jobRole: profile?.jobRole ?? null
    }, '[DEBUG] /interview/start — profile data from DB')

    // ── Auto-extract resumeText if missing but resumeUrl exists ───────────
    let resumeText = profile?.resumeText ?? null
    if (!resumeText && profile?.resumeUrl) {
      request.log.info({ userId }, 'resumeText missing — fetching and extracting from Cloudinary URL')
      try {
        // Use Admin API with Basic Auth — bypasses CDN access control restrictions
        const buffer = await downloadCloudinaryRaw(profile.resumeUrl)
        console.log(`[ResumeExtract] Fetched OK — size=${buffer.length} firstBytes="${buffer.slice(0, 4).toString()}"`)
        const extracted = await extractPdfText(buffer)
        if (extracted) {
          resumeText = extracted
          // Save back to DB so future sessions don't need to re-fetch
          await getDb()
            .update(profiles)
            .set({ resumeText: extracted, updatedAt: new Date() })
            .where(eq(profiles.userId, userId))
          request.log.info({ userId, resumeTextLength: extracted.length }, 'resumeText extracted and saved to DB')
        } else {
          request.log.warn({ userId }, 'PDF fetch succeeded but text extraction returned empty')
        }
      } catch (err) {
        console.error(`[ResumeExtract] FAILED: ${(err as Error).message}`)
        request.log.error({ userId }, 'Failed to auto-extract resumeText — continuing without it')
      }
    }

    // Accept prior Q&A history so session can be rebuilt after a Railway restart
    const rawHistory = (request.body as { history?: unknown }).history
    const history: HistoryTurn[] = Array.isArray(rawHistory)
      ? (rawHistory as Array<{ question?: unknown; answer?: unknown }>)
          .filter(t => typeof t.question === 'string' && typeof t.answer === 'string' && t.answer)
          .map(t => ({ question: t.question as string, answer: t.answer as string }))
      : []

    await initUserSession(userId, {
      name: user.name,
      email: user.email,
      resumeUrl: profile?.resumeUrl ?? null,
      resumeText,
      jobDescription: profile?.jobDescription ?? null,
      jobRole: profile?.jobRole ?? null,
      experience: profile?.experience ?? null,
      interviewType: profile?.interviewType ?? null,
      company: profile?.company ?? null,
      language: profile?.language ?? null,
      aiInstructions: profile?.aiInstructions ?? null
    }, history)

    // Initialize code analysis session with user context
    await initCodeAnalysisSession(userId, {
      name: user.name,
      resumeText,
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

  // Send transcribed text → stream AI answer as SSE
  app.post('/interview/ask', { preHandler: authMiddleware }, async (request, reply) => {
    const { userId } = (request as AuthRequest).user
    const { text } = request.body as { text: string }

    if (!text?.trim()) {
      return reply.code(400).send({ error: 'Text is required' })
    }

    if (!hasActiveSession(userId)) {
      return reply.code(400).send({ error: 'No active interview session' })
    }

    const utteranceId = crypto.randomUUID()
    request.log.info({ userId, utteranceId, textLength: text.trim().length }, 'interview/ask received')

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    raw.write('\n')

    try {
      for await (const chunk of generateAnswerStream(userId, text.trim(), utteranceId)) {
        raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
      }
      raw.write('data: [DONE]\n\n')
    } catch (err) {
      request.log.error({ err, userId, utteranceId }, 'generateAnswerStream failed')
      const msg = (err as Error).message || 'The AI service is temporarily unavailable. Please try again.'
      raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    } finally {
      raw.end()
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

    if (!image || typeof image !== 'string') {
      return reply.code(400).send({ error: 'image is required' })
    }

    // Reject oversized payloads early (> 5MB base64 ≈ 3.7MB raw)
    if (image.length > 5 * 1024 * 1024) {
      return reply.code(413).send({ error: 'Image too large' })
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
