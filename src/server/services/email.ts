import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

const FROM = 'innogarage.ai <onboarding@resend.dev>'

export async function sendVerificationEmail(
  email: string,
  code: string,
  name: string
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM,
    to: email,
    subject: 'Verify your innogarage.ai account',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #6366f1;">innogarage.ai</h2>
        <p>Hi ${name},</p>
        <p>Your verification code is:</p>
        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
      </div>
    `
  })
  if (error) throw new Error(error.message)
}

export async function sendSigninOtpEmail(email: string, code: string, name: string): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM,
    to: email,
    subject: 'Your innogarage.ai sign-in code',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #6366f1;">innogarage.ai</h2>
        <p>Hi ${name},</p>
        <p>Your sign-in verification code is:</p>
        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
      </div>
    `
  })
  if (error) throw new Error(error.message)
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your innogarage.ai password',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #6366f1;">innogarage.ai</h2>
        <p>Your password reset code is:</p>
        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
      </div>
    `
  })
  if (error) throw new Error(error.message)
}

