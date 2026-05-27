import { create } from 'zustand'

interface Profile {
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
}

interface Plan {
  id: string
  planType: string
  price: string
  startsAt: string
  expiresAt: string
  isActive: boolean
}

interface ProfileState {
  profile: Profile | null
  plan: Plan | null
  loadFromStorage: () => Promise<void>
  setProfile: (profile: Profile | null) => void
  setPlan: (plan: Plan | null) => void
  reset: () => void
}

interface StoredProfileState {
  profile: Profile | null
  plan: Plan | null
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  plan: null,

  loadFromStorage: async () => {
    const stored = await window.api.storageGet<StoredProfileState>('profile')
    if (!stored) return
    set({ profile: stored.profile, plan: stored.plan })
  },

  setProfile: (profile) => set((state) => {
    const nextState = { profile, plan: state.plan }
    void window.api.storageSet('profile', nextState)
    return { profile }
  }),

  setPlan: (plan) => set((state) => {
    const nextState = { profile: state.profile, plan }
    void window.api.storageSet('profile', nextState)
    return { plan }
  }),

  reset: () => {
    void window.api.storageDelete('profile')
    set({ profile: null, plan: null })
  }
}))
