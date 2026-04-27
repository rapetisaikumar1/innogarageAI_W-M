import { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required')
}
const JWT_SECRET = jwtSecret

interface JwtPayload {
  userId: string
  email: string
}

function decodeToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET)
  if (
    !decoded ||
    typeof decoded !== 'object' ||
    typeof decoded.userId !== 'string' ||
    typeof decoded.email !== 'string'
  ) {
    throw new Error('Invalid token payload')
  }
  return { userId: decoded.userId, email: decoded.email }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or invalid authorization header' })
    return
  }

  const token = authHeader.substring(7)
  try {
    const decoded = decodeToken(token)
    ;(request as FastifyRequest & { user: JwtPayload }).user = decoded
  } catch {
    reply.code(401).send({ error: 'Invalid or expired token' })
  }
}

export function generateToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' })
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function verifyToken(token: string): JwtPayload {
  return decodeToken(token)
}
