import { ElectronAPI } from '@electron-toolkit/preload'

type PersistedStorageKey = 'auth' | 'profile' | 'sessions'

interface WindowAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  openExternal: (url: string) => Promise<void>
  platform: string
  downloadFile: (url: string) => Promise<void>
  storageGet: <T>(key: PersistedStorageKey) => Promise<T | null>
  storageSet: <T>(key: PersistedStorageKey, value: T) => Promise<void>
  storageDelete: (key: PersistedStorageKey) => Promise<void>
  googleAuth: () => Promise<
    | {
        type: 'login'
        token: string
        user: { id: string; name: string; email: string; phone: string | null }
      }
    | { type: 'verify'; email: string; name: string; googleId: string }
  >
  googleVerify: (loginHint?: string) => Promise<{ email: string; googleId: string; name: string }>
  getDesktopAudioSourceId: () => Promise<string | null>
  getScreenPermissionStatus: () => Promise<string>
  openScreenSettings: () => Promise<void>
  triggerScreenPermission: () => Promise<{
    granted: boolean
    sourceId: string | null
    status: string
  }>
  setStealthMode: (flag: boolean) => void
  onStealthModeChanged: (callback: (enabled: boolean) => void) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowAPI
  }
}
