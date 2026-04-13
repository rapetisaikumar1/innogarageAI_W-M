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
  loadSessions: () => void
  saveSession: (session: PastSession) => void
  clearAll: () => void
}

const STORAGE_KEY = 'ig-past-sessions'

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],

  loadSessions: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const sessions: PastSession[] = raw ? (JSON.parse(raw) as PastSession[]) : []
      set({ sessions })
    } catch {
      set({ sessions: [] })
    }
  },

  saveSession: (session) => {
    set((state) => {
      const sessions = [session, ...state.sessions].slice(0, 100)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
      } catch {
        // localStorage quota exceeded — skip persistence
      }
      return { sessions }
    })
  },

  clearAll: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ sessions: [] })
  }
}))
