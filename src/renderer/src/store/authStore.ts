import { create } from 'zustand'

interface User {
  id: string
  name: string
  email: string
  phone: string | null
}

interface AuthState {
  user: User | null
  token: string | null
  isLoggedIn: boolean
  hasHydrated: boolean
  setAuth: (user: User, token: string) => void
  logout: () => void
  loadFromStorage: () => Promise<void>
}

interface StoredAuth {
  user: User
  token: string
}

function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = JSON.parse(atob(padded)) as { exp?: unknown }

    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null
  } catch {
    return null
  }
}

function readLegacyAuth(): StoredAuth | null {
  const token = localStorage.getItem('token')
  const userStr = localStorage.getItem('user')
  if (!token || !userStr) return null

  try {
    return { token, user: JSON.parse(userStr) as User }
  } catch {
    return null
  }
}

function clearLegacyAuth(): void {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoggedIn: false,
  hasHydrated: false,

  setAuth: (user, token) => {
    clearLegacyAuth()
    void window.api.storageSet<StoredAuth>('auth', { user, token })
    set({ user, token, isLoggedIn: true, hasHydrated: true })
  },

  logout: () => {
    clearLegacyAuth()
    void window.api.storageDelete('auth')
    set({ user: null, token: null, isLoggedIn: false, hasHydrated: true })
  },

  loadFromStorage: async () => {
    const secureAuth = await window.api.storageGet<StoredAuth>('auth')
    const storedAuth = secureAuth ?? readLegacyAuth()

    if (!storedAuth) {
      clearLegacyAuth()
      set({ user: null, token: null, isLoggedIn: false, hasHydrated: true })
      return
    }

    const expiryMs = getTokenExpiryMs(storedAuth.token)
    if (expiryMs !== null && expiryMs <= Date.now()) {
      clearLegacyAuth()
      await window.api.storageDelete('auth')
      set({ user: null, token: null, isLoggedIn: false, hasHydrated: true })
      return
    }

    clearLegacyAuth()
    await window.api.storageSet<StoredAuth>('auth', storedAuth)
    set({ user: storedAuth.user, token: storedAuth.token, isLoggedIn: true, hasHydrated: true })
  }
}))
