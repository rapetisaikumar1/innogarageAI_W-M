import https from 'https'

const BREVO_API_KEY = process.env.BREVO_API_KEY || ''
const FROM_EMAIL = process.env.FROM_EMAIL || 'rapetisaikumar1999@gmail.com'
const FROM_NAME = 'innogarage.ai'

async function sendMail(to: string, subject: string, html: string, text: string): Promise<void> {
  const payload = JSON.stringify({
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text
  })

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[email] Sent to ${to} via Brevo — ${res.statusCode}`)
            resolve()
          } else {
            reject(new Error(`Brevo error ${res.statusCode}: ${body}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Brevo request timed out')) })
    req.write(payload)
    req.end()
  })
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

