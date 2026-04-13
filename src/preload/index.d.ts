import { ElectronAPI } from '@electron-toolkit/preload'

interface WindowAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  openExternal: (url: string) => Promise<void>
  platform: string
  downloadFile: (url: string) => Promise<void>
  googleAuth: () => Promise<
    | { type: 'login'; token: string; user: { id: string; name: string; email: string; phone: string | null } }
    | { type: 'verify'; email: string; name: string; googleId: string }
  >
  googleVerify: (loginHint?: string) => Promise<{ email: string; googleId: string; name: string }>
  getDesktopAudioSourceId: () => Promise<string | null>
  setAlwaysOnTop: (flag: boolean) => void
  setOverlayMode: (flag: boolean) => void
  setContentProtection: (flag: boolean) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowAPI
  }
}
