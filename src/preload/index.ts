import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  platform: process.platform,
  downloadFile: (url: string): Promise<void> => ipcRenderer.invoke('download-file', url),
  googleAuth: (): Promise<
    | { type: 'login'; token: string; user: { id: string; name: string; email: string; phone: string | null } }
    | { type: 'verify'; email: string; name: string; googleId: string }
  > => ipcRenderer.invoke('auth:google'),
  googleVerify: (loginHint?: string): Promise<{ email: string; googleId: string; name: string }> =>
    ipcRenderer.invoke('auth:google-verify', loginHint),
  getDesktopAudioSourceId: (): Promise<string | null> =>
    ipcRenderer.invoke('audio:get-desktop-source-id'),
  getScreenPermissionStatus: (): Promise<string> =>
    ipcRenderer.invoke('audio:get-screen-permission-status'),
  openScreenSettings: (): Promise<void> =>
    ipcRenderer.invoke('audio:open-screen-settings'),
  setAlwaysOnTop: (flag: boolean): void => ipcRenderer.send('window:setAlwaysOnTop', flag),
  setOverlayMode: (flag: boolean): void => ipcRenderer.send('window:setOverlayMode', flag),
  setContentProtection: (flag: boolean): void => ipcRenderer.send('window:setContentProtection', flag)
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
