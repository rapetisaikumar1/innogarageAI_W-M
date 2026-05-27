import { create } from 'zustand'

export interface QAPair {
  id: string
  question: string
  answer: string
  timestamp: number
}

export interface TranscriptionEntry {
  text: string
  timestamp: number
}

export interface CodeSuggestion {
  id: string
  detected: boolean
  language: string
  context: string
  suggestion: string
  explanation: string
  timestamp: number
}

interface InterviewState {
  isInterviewActive: boolean
  audioSource: 'mic' | 'system'
  elapsedSeconds: number
  transcriptions: TranscriptionEntry[]
  currentInterim: string
  qaPairs: QAPair[]
  isProcessing: boolean
  error: string | null
  sessionPersisted: boolean

  // Code suggestions state
  codeSuggestion: CodeSuggestion | null
  isAnalyzingScreen: boolean
  screenCaptureActive: boolean

  setInterviewActive: (active: boolean) => void
  setAudioSource: (source: 'mic' | 'system') => void
  setElapsedSeconds: (seconds: number) => void
  addTranscription: (text: string) => void
  setCurrentInterim: (text: string) => void
  addQAPair: (pair: QAPair) => void
  updateQAPairAnswer: (id: string, answer: string) => void
  setProcessing: (processing: boolean) => void
  setError: (error: string | null) => void
  setSessionPersisted: (persisted: boolean) => void

  // Code suggestions actions
  setCodeSuggestion: (suggestion: CodeSuggestion | null) => void
  setAnalyzingScreen: (analyzing: boolean) => void
  setScreenCaptureActive: (active: boolean) => void

  reset: () => void
}

export const useInterviewStore = create<InterviewState>((set) => ({
  isInterviewActive: false,
  audioSource: 'mic',
  elapsedSeconds: 0,
  transcriptions: [],
  currentInterim: '',
  qaPairs: [],
  isProcessing: false,
  error: null,
  sessionPersisted: false,

  // Code suggestions
  codeSuggestion: null,
  isAnalyzingScreen: false,
  screenCaptureActive: false,

  setInterviewActive: (active) => set({ isInterviewActive: active }),
  setAudioSource: (source) => set({ audioSource: source }),
  setElapsedSeconds: (seconds) => set({ elapsedSeconds: seconds }),
  addTranscription: (text) =>
    set((state) => ({
      transcriptions: [{ text, timestamp: Date.now() }, ...state.transcriptions]
    })),
  setCurrentInterim: (text) => set({ currentInterim: text }),
  addQAPair: (pair) =>
    set((state) => ({ qaPairs: [pair, ...state.qaPairs] })),
  updateQAPairAnswer: (id, answer) =>
    set((state) => ({ qaPairs: state.qaPairs.map((p) => (p.id === id ? { ...p, answer } : p)) })),
  setProcessing: (processing) => set({ isProcessing: processing }),
  setError: (error) => set({ error }),
  setSessionPersisted: (persisted) => set({ sessionPersisted: persisted }),

  // Code suggestions
  setCodeSuggestion: (suggestion) => set({ codeSuggestion: suggestion }),
  setAnalyzingScreen: (analyzing) => set({ isAnalyzingScreen: analyzing }),
  setScreenCaptureActive: (active) => set({ screenCaptureActive: active }),

  reset: () =>
    set({
      isInterviewActive: false,
      audioSource: 'mic',
      elapsedSeconds: 0,
      transcriptions: [],
      currentInterim: '',
      qaPairs: [],
      isProcessing: false,
      error: null,
      sessionPersisted: false,
      codeSuggestion: null,
      isAnalyzingScreen: false,
      screenCaptureActive: false
    })
}))
