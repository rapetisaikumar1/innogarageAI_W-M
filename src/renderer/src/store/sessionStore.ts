import { create } from 'zustand'
import type { QAPair, TranscriptionEntry } from './interviewStore'

export interface PastSession {
  id: string
  date: number         // Unix ms timestamp when interview ended
  duration: number     // seconds
  qaPairs: QAPair[]
  transcriptions: TranscriptionEntry[]
}

interface SessionState {
  sessions: PastSession[]
  loadSessions: () => Promise<void>
  saveSession: (session: PastSession) => void
  clearAll: () => void
}

const STORAGE_KEY = 'ig-past-sessions'

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],

  loadSessions: async () => {
    const legacyRaw = localStorage.getItem(STORAGE_KEY)
    try {
      const storedSessions = await window.api.storageGet<PastSession[]>('sessions')
      const legacySessions: PastSession[] = legacyRaw ? (JSON.parse(legacyRaw) as PastSession[]) : []
      const sessions = storedSessions ?? legacySessions
      if (legacyRaw) {
        localStorage.removeItem(STORAGE_KEY)
        await window.api.storageSet('sessions', sessions)
      }
      set({ sessions })
    } catch {
      set({ sessions: [] })
    }
  },

  saveSession: (session) => {
    set((state) => {
      const sessions = [session, ...state.sessions].slice(0, 100)
      localStorage.removeItem(STORAGE_KEY)
      void window.api.storageSet('sessions', sessions)
      return { sessions }
    })
  },

  clearAll: () => {
    localStorage.removeItem(STORAGE_KEY)
    void window.api.storageDelete('sessions')
    set({ sessions: [] })
  }
}))
