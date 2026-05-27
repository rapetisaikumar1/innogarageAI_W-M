import { FastifyInstance, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getDb } from '../db'
import { users, profiles } from '../db/schema'
import { sendVerificationEmail, sendSigninOtpEmail, sendPasswordResetEmail } from '../services/email'
import { getGoogleAuthUrl, getGoogleUser } from '../services/google-auth'
import { generateToken } from '../middleware/auth'

/** Generate a cryptographically secure 6-digit OTP. */
function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999))
}

// Separate OTP stores for each flow to avoid collisions
const otpStore = new Map<string, { code: string; expiresAt: number; name: string }>()       // registration
const signinOtpStore = new Map<string, { code: string; expiresAt: number }>()               // sign-in 2FA
const resetOtpStore = new Map<string, { code: string; expiresAt: number }>()                // password reset
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
let otpCleanupInterval: ReturnType<typeof setInterval> | null = null

// Periodic cleanup of expired OTPs to prevent memory leaks
function purgeExpiredOtps(): void {
  const now = Date.now()
  for (const [key, val] of otpStore) {
    if (val.expiresAt < now) otpStore.delete(key)
  }
  for (const [key, val] of signinOtpStore) {
    if (val.expiresAt < now) signinOtpStore.delete(key)
  }
  for (const [key, val] of resetOtpStore) {
    if (val.expiresAt < now) resetOtpStore.delete(key)
  }
}

function purgeExpiredRateLimits(): void {
  const now = Date.now()
  for (const [key, val] of rateLimitStore) {
    if (val.resetAt <= now) rateLimitStore.delete(key)
  }
}

function startAuthCleanup(): void {
  if (otpCleanupInterval) return
  otpCleanupInterval = setInterval(() => {
    purgeExpiredOtps()
    purgeExpiredRateLimits()
  }, 5 * 60 * 1000)
  otpCleanupInterval.unref?.()
}

function stopAuthCleanup(): void {
  if (!otpCleanupInterval) return
  clearInterval(otpCleanupInterval)
  otpCleanupInterval = null
}

function consumeRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const existing = rateLimitStore.get(key)

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    }
  }

  existing.count += 1
  rateLimitStore.set(key, existing)
  return { allowed: true, retryAfterSeconds: 0 }
}

function isRateLimited(reply: FastifyReply, key: string, limit: number, windowMs: number, error: string): boolean {
  const result = consumeRateLimit(key, limit, windowMs)
  if (result.allowed) return false

  reply.header('Retry-After', String(result.retryAfterSeconds))
  void reply.code(429).send({ error })
  return true
}

function clearRateLimit(key: string): void {
  rateLimitStore.delete(key)
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  startAuthCleanup()
  app.addHook('onClose', async () => {
    stopAuthCleanup()
  })

  // Google identity — returns Google user info without touching DB (used for email verification during signup)
  app.get('/auth/google/identity', async (request, reply) => {
    if (isRateLimited(reply, `google-identity:ip:${request.ip}`, 10, 10 * 60 * 1000, 'Too many requests. Please wait before trying again.')) return
    const { code } = request.query as { code: string }
    if (!code) return reply.code(400).send({ error: 'Missing code' })
    const googleUser = await getGoogleUser(code)
    return {
      email: googleUser.email.trim().toLowerCase(),
      googleId: googleUser.googleId,
      name: googleUser.name
    }
  })

  // Send OTP — validates email not already taken, then emails 6-digit code
  app.post('/auth/send-otp', async (request, reply) => {
    const { name } = request.body as { name: string }
    const email = ((request.body as { email: string }).email || '').trim().toLowerCase()

    if (isRateLimited(reply, `signup-send:ip:${request.ip}`, 5, 10 * 60 * 1000, 'Too many verification code requests. Please wait before trying again.')) return

    if (!email || !name) {
      return reply.code(400).send({ error: 'Email and name are required' })
    }

    if (isRateLimited(reply, `signup-send:email:${email}`, 3, 10 * 60 * 1000, 'Too many verification code requests. Please wait before trying again.')) return

    const [existing] = await getDb().select().from(users).where(eq(users.email, email)).limit(1)
    if (existing) {
      if (existing.googleId) {
        return reply.code(409).send({
          error: 'This email is registered via Google. Please use "Sign in with Google".'
        })
      }
      return reply.code(409).send({ error: 'An account with this email already exists.' })
    }

    const code = generateOtp()
    const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes

    otpStore.set(email, { code, expiresAt, name })

    try {
      await sendVerificationEmail(email, code, name)
    } catch (err) {
      otpStore.delete(email)
      request.log.error({ err, email }, 'Failed to send registration verification email')
      return reply.code(502).send({ error: 'Unable to send verification code right now. Please try again.' })
    }
    console.log(`[auth] OTP generated for ${email}`)

    return { message: 'Verification code sent' }
  })

  // Register — requires valid OTP; returns JWT directly
  app.post('/auth/register', async (request, reply) => {
    const { name, phone, password, otp } = request.body as {
      name: string
      email: string
      phone: string
      password: string
      otp: string
    }
    const email = ((request.body as { email: string }).email || '').trim().toLowerCase()

    if (email && isRateLimited(reply, `signup-verify:${email}`, 8, 10 * 60 * 1000, 'Too many verification attempts. Please request a new code.')) return

    // Verify OTP
    const stored = otpStore.get(email)
    if (!stored) {
      return reply.code(400).send({ error: 'No verification code found. Please request a new one.' })
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(email)
      return reply.code(400).send({ error: 'Verification code has expired. Please request a new one.' })
    }
    if (stored.code !== otp?.trim()) {
      return reply.code(400).send({ error: 'Incorrect verification code.' })
    }

    // OTP valid — remove it to prevent reuse
    otpStore.delete(email)
    clearRateLimit(`signup-verify:${email}`)

    const [existing] = await getDb().select().from(users).where(eq(users.email, email)).limit(1)
    if (existing) {
      if (existing.googleId) {
        return reply.code(409).send({
          error: 'This email is registered via Google. Please use "Sign in with Google".'
        })
      }
      return reply.code(409).send({ error: 'An account with this email already exists.' })
    }

    if (!password || password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters.' })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const [user] = await getDb()
      .insert(users)
      .values({
        name,
        email,
        phone,
        passwordHash,
        isVerified: true
      })
      .returning()

    await getDb().insert(profiles).values({ userId: user.id })

    const token = generateToken(user.id, user.email)
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone }
    }
  })

  // Send sign-in OTP — validates credentials first, then sends OTP
  app.post('/auth/send-signin-otp', async (request, reply) => {
    const email = ((request.body as { email: string }).email || '').trim().toLowerCase()
    const { password } = request.body as { password: string }

    if (isRateLimited(reply, `signin-send:ip:${request.ip}`, 8, 10 * 60 * 1000, 'Too many sign-in code requests. Please wait before trying again.')) return
    if (isRateLimited(reply, `signin-send:email:${email}`, 5, 10 * 60 * 1000, 'Too many sign-in code requests. Please wait before trying again.')) return

    const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1)

    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password' })
    }
    if (user.googleId) {
      return reply.code(401).send({ error: 'Invalid email or password' })
    }
    if (!user.passwordHash) {
      return reply.code(401).send({ error: 'Invalid email or password' })
    }
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid email or password' })
    }

    // Credentials valid — generate and send OTP
    const code = generateOtp()
    signinOtpStore.set(email, { code, expiresAt: Date.now() + 10 * 60 * 1000 })

    try {
      await sendSigninOtpEmail(email, code, user.name)
    } catch (err) {
      signinOtpStore.delete(email)
      request.log.error({ err, email }, 'Failed to send sign-in verification email')
      return reply.code(502).send({ error: 'Unable to send verification code right now. Please try again.' })
    }
    console.log(`[auth] Sign-in OTP generated for ${email}`)

    return { message: 'Verification code sent' }
  })

  // Login — verifies OTP, then issues JWT
  app.post('/auth/login', async (request, reply) => {
    const email = ((request.body as { email: string }).email || '').trim().toLowerCase()
    const { otp } = request.body as { otp: string }

    if (email && isRateLimited(reply, `signin-verify:${email}`, 8, 10 * 60 * 1000, 'Too many sign-in attempts. Please request a new code.')) return

    const stored = signinOtpStore.get(email)
    if (!stored) {
      return reply.code(400).send({ error: 'No verification code found. Please request a new one.' })
    }
    if (Date.now() > stored.expiresAt) {
      signinOtpStore.delete(email)
      return reply.code(400).send({ error: 'Verification code has expired. Please request a new one.' })
    }
    if (stored.code !== otp?.trim()) {
      return reply.code(400).send({ error: 'Incorrect verification code.' })
    }
    signinOtpStore.delete(email)
    clearRateLimit(`signin-verify:${email}`)

    const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) {
      return reply.code(401).send({ error: 'Account not found.' })
    }

    const token = generateToken(user.id, user.email)
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone }
    }
  })

  // Google auth URL — accepts optional ?hint=email to pre-fill the Google sign-in
  app.get('/auth/google/url', async (request) => {
    const { hint } = request.query as { hint?: string }
    return { url: getGoogleAuthUrl(hint) }
  })

  // Google callback — returns {type:'login',...} for returning users, {type:'verify',...} for new users
  app.get('/auth/google/callback', async (request, reply) => {
    const { code } = request.query as { code: string }

    const googleUser = await getGoogleUser(code)
    const googleEmail = googleUser.email.trim().toLowerCase()

    if (isRateLimited(reply, `google-send:ip:${request.ip}`, 5, 10 * 60 * 1000, 'Too many verification code requests. Please wait before trying again.')) return
    if (isRateLimited(reply, `google-send:email:${googleEmail}`, 3, 10 * 60 * 1000, 'Too many verification code requests. Please wait before trying again.')) return

    // Returning Google user — log in directly, no OTP needed
    const [existing] = await getDb()
      .select()
      .from(users)
      .where(eq(users.googleId, googleUser.googleId))
      .limit(1)

    if (existing) {
      const token = generateToken(existing.id, existing.email)
      return {
        type: 'login',
        token,
        user: { id: existing.id, name: existing.name, email: existing.email, phone: existing.phone }
      }
    }

    // Email already registered via email/password — block cross-path
    const [existingByEmail] = await getDb()
      .select()
      .from(users)
      .where(eq(users.email, googleEmail))
      .limit(1)

    if (existingByEmail) {
      return reply.code(409).send({
        error: 'This email is already registered. Please use the Sign In form instead.'
      })
    }

    // New user — send OTP to Google email before creating account
    const otpCode = generateOtp()
    const expiresAt = Date.now() + 10 * 60 * 1000
    otpStore.set(googleEmail, { code: otpCode, expiresAt, name: googleUser.name })

    try {
      await sendVerificationEmail(googleEmail, otpCode, googleUser.name)
    } catch (err) {
      otpStore.delete(googleEmail)
      request.log.error({ err, email: googleEmail }, 'Failed to send Google registration verification email')
      return reply.code(502).send({ error: 'Unable to send verification code right now. Please try again.' })
    }
    console.log(`[auth] Google OTP generated for ${googleEmail}`)

    return {
      type: 'verify',
      email: googleEmail,
      name: googleUser.name,
      googleId: googleUser.googleId
    }
  })

  // Complete Google registration — verifies OTP then creates account
  app.post('/auth/google/complete', async (request, reply) => {
    const { name, googleId, otp } = request.body as { name: string; googleId: string; otp: string }
    const email = ((request.body as { email: string }).email || '').trim().toLowerCase()

    if (email && isRateLimited(reply, `google-verify:${email}`, 8, 10 * 60 * 1000, 'Too many verification attempts. Please request a new code.')) return

    const stored = otpStore.get(email)
    if (!stored) {
      return reply.code(400).send({ error: 'No verification code found. Please try again.' })
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(email)
      return reply.code(400).send({ error: 'Verification code has expired. Please try again.' })
    }
    if (stored.code !== otp?.trim()) {
      return reply.code(400).send({ error: 'Incorrect verification code.' })
    }
    otpStore.delete(email)
    clearRateLimit(`google-verify:${email}`)

    // Race condition guard
    const [exists] = await getDb().select().from(users).where(eq(users.email, email)).limit(1)
    if (exists) {
      if (exists.googleId === googleId) {
        // Same Google account already persisted — just issue a token
        const token = generateToken(exists.id, exists.email)
        return { token, user: { id: exists.id, name: exists.name, email: exists.email, phone: exists.phone } }
      }
      if (exists.passwordHash) {
        return reply.code(409).send({ error: 'This email is registered with email/password. Please sign in using your email and password.' })
      }
      return reply.code(409).send({ error: 'An account with this email already exists.' })
    }

    const [user] = await getDb()
      .insert(users)
      .values({ name, email, googleId, isVerified: true })
      .returning()

    await getDb().insert(profiles).values({ userId: user.id })

    const token = generateToken(user.id, user.email)
    return { token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } }
  })

  // Forgot password — sends 6-digit OTP to email
  app.post('/auth/forgot-password', async (request, reply) => {
    const email = ((request.body as { email: string }).email || '').trim().toLowerCase()
    const genericMessage = { message: 'If an account with this email exists, a password reset code has been sent.' }

    if (isRateLimited(reply, `reset-send:ip:${request.ip}`, 5, 10 * 60 * 1000, 'Too many password reset requests. Please wait before trying again.')) return
    if (isRateLimited(reply, `reset-send:email:${email}`, 3, 10 * 60 * 1000, 'Too many password reset requests. Please wait before trying again.')) return

    const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1)
    if (!user || user.googleId) {
      return genericMessage
    }

    const code = generateOtp()
    resetOtpStore.set(email, { code, expiresAt: Date.now() + 10 * 60 * 1000 })

    try {
      await sendPasswordResetEmail(email, code)
    } catch (err) {
      resetOtpStore.delete(email)
      request.log.error({ err, email }, 'Failed to send password reset email')
      return genericMessage // still return generic to prevent account enumeration
    }
    console.log(`[auth] Password reset OTP generated for ${email}`)

    return genericMessage
  })

  // Reset password — verifies OTP, then sets new password
  app.post('/auth/reset-password', async (request, reply) => {
    const { otp, newPassword } = request.body as { otp: string; newPassword: string }
    const email = ((request.body as { email: string }).email || '').trim().toLowerCase()

    if (email && isRateLimited(reply, `reset-verify:${email}`, 8, 10 * 60 * 1000, 'Too many reset attempts. Please request a new code.')) return

    const stored = resetOtpStore.get(email)
    if (!stored) {
      return reply.code(400).send({ error: 'No reset code found. Please request a new one.' })
    }
    if (Date.now() > stored.expiresAt) {
      resetOtpStore.delete(email)
      return reply.code(400).send({ error: 'Reset code has expired. Please request a new one.' })
    }
    if (stored.code !== otp?.trim()) {
      return reply.code(400).send({ error: 'Incorrect reset code.' })
    }
    resetOtpStore.delete(email)
    clearRateLimit(`reset-verify:${email}`)

    if (!newPassword || newPassword.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters.' })
    }

    const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) {
      return reply.code(404).send({ error: 'Account not found.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await getDb()
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id))

    return { message: 'Password reset successfully' }
  })
}
