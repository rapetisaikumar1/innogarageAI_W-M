import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import { config } from 'dotenv'
import { authRoutes } from './routes/auth'
import { profileRoutes } from './routes/profile'
import { planRoutes } from './routes/plan'
import { interviewRoutes } from './routes/interview'
import { Resend } from 'resend'

config()

const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 })

async function start(): Promise<void> {
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
  await app.register(websocket)

  await app.register(authRoutes)
  await app.register(profileRoutes)
  await app.register(planRoutes)
  await app.register(interviewRoutes)

  // Temporary debug route — checks Resend API key and sends a test email
  app.get('/debug/email', async (_req, reply) => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return reply.send({ ok: false, error: 'Missing RESEND_API_KEY env var' })
    }
    try {
      const resend = new Resend(apiKey)
      const { error } = await resend.emails.send({
        from: 'innogarage.ai <onboarding@resend.dev>',
        to: 'rapetisaikumar1999@gmail.com',
        subject: 'Railway email test',
        text: 'Railway Resend API is working.'
      })
      if (error) return reply.send({ ok: false, error: error.message })
      return { ok: true, apiKey: `${apiKey.slice(0, 8)}...` }
    } catch (err: unknown) {
      return reply.send({ ok: false, error: (err as Error).message })
    }
  })

  const port = parseInt(process.env.PORT || process.env.SERVER_PORT || '3847')
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Server running on http://localhost:${port}`)
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

export { app }
