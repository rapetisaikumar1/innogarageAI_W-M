import { FastifyInstance, FastifyRequest } from 'fastify'
import { eq, and, gt, desc } from 'drizzle-orm'
import https from 'https'
import http from 'http'
import mammoth from 'mammoth'
import { getDb } from '../db'
import { profiles, users, plans } from '../db/schema'
import { authMiddleware, verifyToken } from '../middleware/auth'
import { uploadResume } from '../services/cloudinary'

interface AuthRequest extends FastifyRequest {
  user: { userId: string; email: string }
}

async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    if (mimeType === 'application/pdf') {
      const { default: pdfParse } = await import('pdf-parse')
      const result = await pdfParse(buffer)
      return result.text.trim()
    }
    if (
      mimeType === 'application/msword' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const result = await mammoth.extractRawText({ buffer })
      return result.value.trim()
    }
  } catch {
    // Non-fatal — continue without text
  }
  return ''
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // Get full user profile (user + profile + active plan)
  app.get('/profile', { preHandler: authMiddleware }, async (request) => {
    const { userId } = (request as AuthRequest).user

    const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1)
    const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
    const [activePlan] = await getDb()
      .select()
      .from(plans)
      .where(and(eq(plans.userId, userId), eq(plans.isActive, true), gt(plans.expiresAt, new Date())))
      .orderBy(desc(plans.createdAt))
      .limit(1)

    return {
      user: user
        ? { id: user.id, name: user.name, email: user.email, phone: user.phone }
        : null,
      profile: profile || null,
      plan: activePlan || null
    }
  })

  // Update profile
  app.put('/profile', { preHandler: authMiddleware }, async (request) => {
    const { userId } = (request as AuthRequest).user
    const body = request.body as {
      jobDescription?: string
      jobRole?: string
      experience?: string
      interviewType?: string
      company?: string
      language?: string
      aiInstructions?: string
    }

    const [updated] = await getDb()
      .update(profiles)
      .set({
        ...body,
        isUpdated: true,
        updatedAt: new Date()
      })
      .where(eq(profiles.userId, userId))
      .returning()

    return { profile: updated }
  })

  // Upload resume
  app.post('/profile/resume', { preHandler: authMiddleware }, async (request, reply) => {
    const { userId } = (request as AuthRequest).user
    const data = await request.file()

    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' })
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]

    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(400).send({ error: 'Only PDF and Word documents are allowed' })
    }

    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk)
    }
    const fileBuffer = Buffer.concat(chunks)

    const resumeText = await extractResumeText(fileBuffer, data.mimetype)
    console.log(`[Profile] resume upload — mimetype=${data.mimetype} fileSize=${fileBuffer.length}B extractedTextLength=${resumeText.length}`)
    const { url } = await uploadResume(fileBuffer, data.filename)

    const [updated] = await getDb()
      .update(profiles)
      .set({ resumeUrl: url, resumeFilename: data.filename, resumeText: resumeText || null, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning()

    return { profile: updated }
  })

  // Proxy resume — streams content from Cloudinary server-to-server via Node https
  // Token accepted as query param so iframes can load without custom headers
  app.get('/profile/resume/proxy', async (request, reply) => {
    const { token, download } = request.query as { token?: string; download?: string }
    if (!token) return reply.code(401).send({ error: 'Unauthorized' })

    let userId: string
    try {
      userId = verifyToken(token).userId
    } catch {
      return reply.code(401).send({ error: 'Invalid token' })
    }

    const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
    if (!profile?.resumeUrl) return reply.code(404).send({ error: 'No resume found' })

    // Fetch the file server-to-server using Node's https module (avoids browser CSP/CORS entirely)
    const fileBuffer = await new Promise<{ data: Buffer; contentType: string }>((resolve, reject) => {
      const fetchUrl = (url: string): void => {
        const lib = url.startsWith('https') ? https : http
        lib.get(url, (res) => {
          // Follow redirects
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return fetchUrl(res.headers.location)
          }
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`Cloudinary returned HTTP ${res.statusCode}`))
          }
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () =>
            resolve({
              data: Buffer.concat(chunks),
              contentType: res.headers['content-type'] || 'application/octet-stream'
            })
          )
          res.on('error', reject)
        }).on('error', reject)
      }
      fetchUrl(profile.resumeUrl!)
    })

    const filename = profile.resumeFilename || 'resume'
    reply.header('Content-Type', fileBuffer.contentType)
    reply.header('Cache-Control', 'no-store')
    reply.header(
      'Content-Disposition',
      download === '1'
        ? `attachment; filename="${filename}"`
        : `inline; filename="${filename}"`
    )
    return reply.send(fileBuffer.data)
  })
}
