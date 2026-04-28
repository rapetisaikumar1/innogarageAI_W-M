const BASE_URL = 'https://innogarage-ai-production.up.railway.app'
const WS_URL = 'wss://innogarage-ai-production.up.railway.app'
const REQUEST_TIMEOUT_MS = 30_000 // 30s default timeout

type AskMessage = { type: 'chunk' | 'done' | 'error'; id?: string; text?: string; error?: string }
type PendingAsk = {
  accumulated: string
  onChunk: (chunk: string) => void
  resolve: (value: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let askSocket: WebSocket | null = null
let askSocketToken: string | null = null
let askSocketOpenPromise: Promise<WebSocket> | null = null
const pendingAsks = new Map<string, PendingAsk>()

function rejectPendingAsks(error: Error): void {
  for (const [, pending] of pendingAsks) {
    clearTimeout(pending.timer)
    pending.reject(error)
  }
  pendingAsks.clear()
}

function closeAskSocket(): void {
  if (askSocket) {
    askSocket.onclose = null
    askSocket.onerror = null
    askSocket.onmessage = null
    if (askSocket.readyState === WebSocket.OPEN || askSocket.readyState === WebSocket.CONNECTING) {
      askSocket.close(1000, 'Interview ended')
    }
  }
  askSocket = null
  askSocketToken = null
  askSocketOpenPromise = null
  rejectPendingAsks(new Error('Q&A WebSocket closed'))
}

function getAskSocket(): Promise<WebSocket> {
  const token = localStorage.getItem('token')
  if (!token) return Promise.reject(new Error('Not authenticated'))

  if (askSocket && askSocketToken === token && askSocket.readyState === WebSocket.OPEN) {
    return Promise.resolve(askSocket)
  }

  if (askSocket && askSocketToken === token && askSocket.readyState === WebSocket.CONNECTING && askSocketOpenPromise) {
    return askSocketOpenPromise
  }

  closeAskSocket()

  askSocketToken = token
  askSocket = new WebSocket(`${WS_URL}/interview/ask-stream?token=${encodeURIComponent(token)}`)

  askSocketOpenPromise = new Promise<WebSocket>((resolve, reject) => {
    const socket = askSocket!
    const openTimer = setTimeout(() => {
      reject(new Error('Q&A WebSocket connection timed out'))
      closeAskSocket()
    }, 5000)

    socket.onopen = () => {
      clearTimeout(openTimer)
      askSocketOpenPromise = null
      resolve(socket)
    }

    socket.onerror = () => {
      clearTimeout(openTimer)
      askSocketOpenPromise = null
      reject(new Error('Q&A WebSocket connection failed'))
    }

    socket.onclose = () => {
      clearTimeout(openTimer)
      askSocketOpenPromise = null
      askSocket = null
      askSocketToken = null
      rejectPendingAsks(new Error('Q&A WebSocket closed'))
    }

    socket.onmessage = (event) => {
      let message: AskMessage
      try { message = JSON.parse(event.data as string) as AskMessage } catch { return }
      const id = message.id
      if (!id) return

      const pending = pendingAsks.get(id)
      if (!pending) return

      if (message.type === 'chunk' && message.text) {
        pending.accumulated += message.text
        pending.onChunk(message.text)
        return
      }

      clearTimeout(pending.timer)
      pendingAsks.delete(id)

      if (message.type === 'done') {
        pending.resolve(pending.accumulated)
      } else if (message.type === 'error') {
        pending.reject(new Error(message.error || 'Request failed'))
      }
    }
  })

  return askSocketOpenPromise
}

async function interviewAskWebSocket(
  text: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const socket = await getAskSocket()
  const id = crypto.randomUUID()

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAsks.delete(id)
      reject(new Error('Request timed out. Please check your connection and try again.'))
      closeAskSocket()
    }, 45_000)

    pendingAsks.set(id, { accumulated: '', onChunk, resolve, reject, timer })

    try {
      socket.send(JSON.stringify({ type: 'ask', id, text }))
    } catch (err) {
      clearTimeout(timer)
      pendingAsks.delete(id)
      reject(err instanceof Error ? err : new Error('Failed to send question'))
    }
  })
}

async function interviewAskSse(
  text: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const token = localStorage.getItem('token')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)

  try {
    const response = await fetch(`${BASE_URL}/interview/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ text }),
      signal: controller.signal
    })

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.hash = '#/'
        throw new Error('Session expired. Please log in again.')
      }
      const errBody = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(errBody.error || 'Request failed')
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let accumulated = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()!  // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') return accumulated
        let parsed: { text?: string; error?: string }
        try { parsed = JSON.parse(payload) } catch { continue }
        if (parsed.error) throw new Error(parsed.error)
        if (parsed.text) {
          accumulated += parsed.text
          onChunk(parsed.text)
        }
      }
    }

    return accumulated
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.')
    }
    if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'))) {
      throw new Error('Network error. Please check your internet connection.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>)
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal
    })

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.hash = '#/'
        throw new Error('Session expired. Please log in again.')
      }
      const error = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(error.error || 'Request failed')
    }

    return response.json()
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.')
    }
    if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'))) {
      throw new Error('Network error. Please check your internet connection.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  // Auth
  sendOtp: (data: { name: string; email: string }) =>
    request<{ message: string }>('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  register: (data: { name: string; email: string; phone: string; password: string; otp: string }) =>
    request<{ token: string; user: { id: string; name: string; email: string; phone: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  completeGoogleRegistration: (data: { email: string; googleId: string; name: string; otp: string }) =>
    request<{ token: string; user: { id: string; name: string; email: string; phone: string } }>('/auth/google/complete', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  sendSigninOtp: (data: { email: string; password: string }) =>
    request<{ message: string }>('/auth/send-signin-otp', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  login: (data: { email: string; otp: string }) =>
    request<{ token: string; user: { id: string; name: string; email: string; phone: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  getGoogleAuthUrl: () => request<{ url: string }>('/auth/google/url'),

  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),

  resetPassword: (data: { email: string; otp: string; newPassword: string }) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Profile
  getProfile: () =>
    request<{
      user: { id: string; name: string; email: string; phone: string } | null
      profile: {
        id: string
        userId: string
        resumeUrl: string | null
        resumeFilename: string | null
        jobDescription: string | null
        jobRole: string | null
        experience: string | null
        interviewType: string | null
        company: string | null
        language: string | null
        aiInstructions: string | null
        isUpdated: boolean
      } | null
      plan: {
        id: string
        planType: string
        price: string
        startsAt: string
        expiresAt: string
        isActive: boolean
      } | null
    }>('/profile'),

  updateProfile: (data: {
    jobDescription?: string
    jobRole?: string
    experience?: string
    interviewType?: string
    company?: string
    language?: string
    aiInstructions?: string
  }) =>
    request<{ profile: unknown }>('/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  uploadResume: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<{ profile: unknown }>('/profile/resume', {
      method: 'POST',
      body: formData
    })
  },

  getResumeDownloadUrl: () =>
    request<{ url: string }>('/profile/resume/download-url'),
  getPlans: () =>
    request<{ plans: { type: string; price: string; duration: string }[] }>('/plans'),

  subscribe: (planType: string) =>
    request<{ plan: unknown }>('/plans/subscribe', {
      method: 'POST',
      body: JSON.stringify({ planType })
    }),

  getActivePlan: () =>
    request<{
      plan: {
        id: string
        planType: string
        price: string
        startsAt: string
        expiresAt: string
        isActive: boolean
      } | null
    }>('/plans/active'),

  // Interview
  interviewStart: (history?: Array<{ question: string; answer: string }>) =>
    request<{ message: string; active: boolean }>('/interview/start', {
      method: 'POST',
      body: JSON.stringify({ history: history ?? [] })
    }),

  interviewAskStream: async (
    text: string,
    onChunk: (chunk: string) => void
  ): Promise<string> => {
    let receivedChunk = false
    try {
      return await interviewAskWebSocket(text, (chunk) => {
        receivedChunk = true
        onChunk(chunk)
      })
    } catch (err) {
      if (receivedChunk) throw err
      return interviewAskSse(text, onChunk)
    }
  },

  interviewEnd: () => {
    closeAskSocket()
    return request<{ message: string }>('/interview/end', {
      method: 'POST',
      body: '{}'
    })
  },

  interviewStatus: () =>
    request<{ active: boolean }>('/interview/status'),

  // Code Suggestions
  codeAnalyze: (image: string) =>
    request<{
      detected: boolean
      language: string
      context: string
      suggestion: string
      explanation: string
    }>('/interview/code-suggest', {
      method: 'POST',
      body: JSON.stringify({ image })
    })
}
