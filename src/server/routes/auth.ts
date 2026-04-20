import { FastifyInstance } from 'fastify'
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
setInterval(purgeExpiredOtps, 5 * 60 * 1000) // every 5 minutes

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Google identity — returns Google user info without touching DB (used for email verification during signup)
  app.get('/auth/google/identity', async (request, reply) => {
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

    if (!email || !name) {
      return reply.code(400).send({ error: 'Email and name are required' })
    }

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

    // Fire-and-forget — respond immediately, don't block on SMTP
    sendVerificationEmail(email, code, name).catch((emailErr) => {
      console.error('[email] Failed to send OTP:', emailErr)
      console.log(`[auth] OTP for ${email}: ${code}`)
    })

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

    const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1)

    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password' })
    }
    if (user.googleId) {
      return reply.code(401).send({
        error: 'This account uses Google Sign-In. Please click "Sign in with Google".'
      })
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

    // Fire-and-forget — respond immediately, don't block on SMTP
    sendSigninOtpEmail(email, code, user.name).catch((emailErr) => {
      console.error('[email] Failed to send sign-in OTP:', emailErr)
      console.log(`[auth] Sign-in OTP for ${email}: ${code}`)
    })

    return { message: 'Verification code sent' }
  })

  // Login — verifies OTP, then issues JWT
  app.post('/auth/login', async (request, reply) => {
    const email = ((request.body as { email: string }).email || '').trim().toLowerCase()
    const { otp } = request.body as { otp: string }

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

    // Fire-and-forget — respond immediately, don't block on SMTP
    sendVerificationEmail(googleEmail, otpCode, googleUser.name).catch((emailErr) => {
      console.error('[email] Failed to send Google OTP:', emailErr)
      console.log(`[auth] Google OTP for ${googleEmail}: ${otpCode}`)
    })

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

    const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) {
      return reply.code(400).send({ error: 'No account found with this email address.' })
    }
    if (user.googleId) {
      return reply.code(400).send({ error: 'This email is registered via Google Sign-In. Please use "Sign in with Google" to access your account.' })
    }

    const code = generateOtp()
    resetOtpStore.set(email, { code, expiresAt: Date.now() + 10 * 60 * 1000 })

    try {
      sendPasswordResetEmail(email, code).catch((emailErr) => {
        console.error('[email] Failed to send password reset OTP:', emailErr)
        console.log(`[auth] Password reset OTP for ${email}: ${code}`)
      })
    } catch (emailErr) {
      console.error('[email] Failed to send password reset OTP:', emailErr)
    }

    return { message: 'If the email exists, a reset code has been sent' }
  })

  // Reset password — verifies OTP, then sets new password
  app.post('/auth/reset-password', async (request, reply) => {
    const { otp, newPassword } = request.body as { otp: string; newPassword: string }
    const email = ((request.body as { email: string }).email || '').trim().toLowerCase()

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
