import nodemailer from 'nodemailer'

let _transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      family: 4, // force IPv4 — Railway does not support IPv6 outbound
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    })
  }
  return _transporter
}

const FROM = `innogarage.ai <${process.env.GMAIL_USER}>`

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const info = await getTransporter().sendMail({ from: FROM, to, subject, html })
  console.log(`[email] Sent to ${to} — messageId: ${info.messageId}`)
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  name: string
): Promise<void> {
  await sendMail(
    email,
    'Verify your innogarage.ai account',
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
    `
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
    `
  )
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  await sendMail(
    email,
    'Reset your innogarage.ai password',
    `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #6366f1;">innogarage.ai</h2>
        <p>Your password reset code is:</p>
        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
      </div>
    `
  )
}

