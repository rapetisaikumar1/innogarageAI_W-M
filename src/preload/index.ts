import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type PersistedStorageKey = 'auth' | 'profile' | 'sessions'

const api = {
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  platform: process.platform,
  downloadFile: (url: string): Promise<void> => ipcRenderer.invoke('download-file', url),
  storageGet: <T>(key: PersistedStorageKey): Promise<T | null> => ipcRenderer.invoke('storage:get', key),
  storageSet: <T>(key: PersistedStorageKey, value: T): Promise<void> => ipcRenderer.invoke('storage:set', key, value),
  storageDelete: (key: PersistedStorageKey): Promise<void> => ipcRenderer.invoke('storage:delete', key),
  googleAuth: (): Promise<
    | {
        type: 'login'
        token: string
        user: { id: string; name: string; email: string; phone: string | null }
      }
    | { type: 'verify'; email: string; name: string; googleId: string }
  > => ipcRenderer.invoke('auth:google'),
  googleVerify: (loginHint?: string): Promise<{ email: string; googleId: string; name: string }> =>
    ipcRenderer.invoke('auth:google-verify', loginHint),
  getDesktopAudioSourceId: (): Promise<string | null> =>
    ipcRenderer.invoke('audio:get-desktop-source-id'),
  getScreenPermissionStatus: (): Promise<string> =>
    ipcRenderer.invoke('audio:get-screen-permission-status'),
  openScreenSettings: (): Promise<void> => ipcRenderer.invoke('audio:open-screen-settings'),
  triggerScreenPermission: (): Promise<{
    granted: boolean
    sourceId: string | null
    status: string
  }> => ipcRenderer.invoke('audio:trigger-screen-permission'),
  setStealthMode: (flag: boolean): void => ipcRenderer.send('window:setStealthMode', flag),
  onStealthModeChanged: (callback: (enabled: boolean) => void): void => {
    ipcRenderer.on('window:stealthModeChanged', (_event, enabled: boolean) => callback(enabled))
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
