import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '')

// Use a non-Gmail FROM to pass Gmail DMARC — must be a verified sender in SendGrid
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'rapetisaikumar1999@gmail.com'
const FROM = { email: FROM_EMAIL, name: 'innogarage.ai' }

async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY is not configured on the server.')
  }
  const [res] = await sgMail.send({
    from: FROM,
    replyTo: FROM,
    to,
    subject,
    html,
    text,
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false }
    }
  })
  console.log(`[email] Sent to ${to} — status ${res.statusCode}`)
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  name: string
): Promise<void> {
  await sendMail(
    email,
    'Your innogarage.ai verification code',
    `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #6366f1;">innogarage.ai</h2>
        <p>Hi ${name},</p>
        <p>Your verification code is:</p>
        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
      </div>
    `,
    `Hi ${name},\n\nYour innogarage.ai verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, please ignore this email.`
  )
}

export async function sendSigninOtpEmail(email: string, code: string, name: string): Promise<void> {
  await sendMail(
    email,
    'Your innogarage.ai sign-in code',
    `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #6366f1;">innogarage.ai</h2>
        <p>Hi ${name},</p>
        <p>Your sign-in verification code is:</p>
        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
      </div>
    `,
    `Hi ${name},\n\nYour innogarage.ai sign-in code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, please ignore this email.`
  )
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  await sendMail(
    email,
    'Your innogarage.ai password reset code',
    `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #6366f1;">innogarage.ai</h2>
        <p>Your password reset code is:</p>
        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
      </div>
    `,
    `Your innogarage.ai password reset code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, please ignore this email.`
  )
}

