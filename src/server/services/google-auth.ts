import { OAuth2Client } from 'google-auth-library'

let _client: OAuth2Client | null = null

function getClient(): OAuth2Client {
  if (!_client) {
    _client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URL || 'https://innogarage-ai-production.up.railway.app/auth/google/callback'
    )
  }
  return _client
}

export function getGoogleAuthUrl(loginHint?: string): string {
  return getClient().generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    ...(loginHint ? { login_hint: loginHint } : {})
  })
}

export async function getGoogleUser(
  code: string
): Promise<{ googleId: string; email: string; name: string }> {
  const { tokens } = await getClient().getToken(code)
  getClient().setCredentials(tokens)

  const ticket = await getClient().verifyIdToken({
    idToken: tokens.id_token!,
    audience: process.env.GOOGLE_CLIENT_ID
  })

  const payload = ticket.getPayload()!
  return {
    googleId: payload.sub,
    email: payload.email!,
    name: payload.name || payload.email!
  }
}
