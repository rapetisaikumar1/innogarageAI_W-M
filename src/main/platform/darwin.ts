import { shell, systemPreferences } from 'electron'
import type { BrowserWindow } from 'electron'
import type { PlatformBehavior } from './types'

// Heartbeat: macOS resets NSWindowSharingNone when screen sharing starts in
// another app (Zoom, Meet, etc.) — no window event fires at that point.
// 1s interval minimises the window where Zoom can capture after any reset.
let cpHeartbeat: ReturnType<typeof setInterval> | null = null
let cpActive = false  // whether content protection is currently desired

function startHeartbeat(win: BrowserWindow): void {
  if (cpHeartbeat) return
  cpHeartbeat = setInterval(() => {
    if (win.isDestroyed()) { stopHeartbeat(); return }
    win.setContentProtection(true)
  }, 1000)
}

function stopHeartbeat(): void {
  if (cpHeartbeat) { clearInterval(cpHeartbeat); cpHeartbeat = null }
}

const darwin: PlatformBehavior = {
  earlySetup() {},

  windowOptions() {
    return {
      transparent: true,
      backgroundColor: '#00000000'
    }
  },

  onWindowCreated(_win) {},

  bindContentProtectionEvents(win, reapply) {
    win.on('focus', reapply)
    win.on('show', reapply)
  },

  applyContentProtection(win, enabled) {
    if (win.isDestroyed()) return
    cpActive = enabled
    win.setContentProtection(enabled)
    if (enabled) {
      startHeartbeat(win)
    } else {
      stopHeartbeat()
    }
  },

  applyOverlayMode(win, enabled) {
    win.setBackgroundColor(enabled ? '#00000000' : '#1a1a2e')
  },

  setAlwaysOnTop(win, flag) {
    win.setAlwaysOnTop(flag, 'screen-saver')
    // setVisibleOnAllWorkspaces resets NSWindowSharingNone on macOS — Zoom
    // can capture the window during the gap before the heartbeat fires.
    // Re-apply immediately after the call to close that window.
    win.setVisibleOnAllWorkspaces(flag, { visibleOnFullScreen: true })
    if (cpActive && !win.isDestroyed()) win.setContentProtection(true)
  },

  setSkipTaskbar(_win, _flag) {},

  appUserModelId() {
    return 'com.innogarage'
  },

  shouldQuitOnAllClosed() {
    return false
  },

  openScreenSettings() {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  },

  getScreenPermissionStatus() {
    return systemPreferences.getMediaAccessStatus('screen')
  },

  contentProtectionDelay() {
    return 350
  },

  cleanup() {
    stopHeartbeat()
  }
}

export default darwin
