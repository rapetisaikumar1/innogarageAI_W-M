import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import { config } from 'dotenv'
import { authRoutes } from './routes/auth'
import { profileRoutes } from './routes/profile'
import { planRoutes } from './routes/plan'
import { interviewRoutes } from './routes/interview'

config()

const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 })
const defaultAllowedOrigins = [
  'https://innogarage-ai-production.up.railway.app',
  'http://localhost:5173'
]
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function isAllowedOrigin(origin?: string): boolean {
  if (!origin || origin === 'null' || origin.startsWith('file://')) return true
  return [...defaultAllowedOrigins, ...allowedOrigins].includes(origin)
}

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'DEEPGRAM_API_KEY']
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.warn(`[server] WARNING: environment variable ${key} is not set — dependent features will fail`)
  }
}

async function start(): Promise<void> {
  await app.register(cors, {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origin not allowed'), false)
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  })
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
  await app.register(websocket)

  await app.register(authRoutes)
  await app.register(profileRoutes)
  await app.register(planRoutes)
  await app.register(interviewRoutes)

  // Health check — used by monitoring, load balancers, and uptime checks
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  const port = parseInt(process.env.PORT || process.env.SERVER_PORT || '3847')
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Server running on http://localhost:${port}`)
}

// Graceful shutdown — close DB connections and active requests
async function shutdown(signal: string): Promise<void> {
  console.log(`[server] ${signal} received — shutting down gracefully`)
  try {
    await app.close()
  } catch (err) {
    console.error('[server] Error during shutdown:', err)
  }
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Prevent unhandled rejections from crashing the server
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason)
})

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

export { app }
