import { shell, systemPreferences } from 'electron'
import type { BrowserWindow } from 'electron'
import type { PlatformBehavior } from './types'

// macOS NSWindowSharingNone can be cleared by AppKit during window state
// changes. Keep the interview window as a normal opaque NSWindow + opacity
// overlay, then aggressively re-apply sharing protection around every state
// transition so Google Meet, Zoom, and Teams capture a protected surface.
const HEARTBEAT_MS = 250
const BURST_REAPPLY_DELAYS = [0, 50, 150, 350, 700]
let cpHeartbeat: ReturnType<typeof setInterval> | null = null
let cpActive = false  // whether content protection is currently desired

function applyProtectedSurface(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.setContentProtection(true)
  try { win.setHiddenInMissionControl(true) } catch { console.warn('[darwin] setHiddenInMissionControl(true) failed') }
}

function burstReapply(win: BrowserWindow): void {
  for (const delay of BURST_REAPPLY_DELAYS) {
    setTimeout(() => {
      if (cpActive) applyProtectedSurface(win)
    }, delay)
  }
}

function startHeartbeat(win: BrowserWindow): void {
  if (cpHeartbeat) return
  cpHeartbeat = setInterval(() => {
    if (win.isDestroyed()) { stopHeartbeat(); return }
    if (cpActive) applyProtectedSurface(win)
  }, HEARTBEAT_MS)
}

function stopHeartbeat(): void {
  if (cpHeartbeat) { clearInterval(cpHeartbeat); cpHeartbeat = null }
}

const darwin: PlatformBehavior = {
  earlySetup() {
    return undefined
  },

  windowOptions() {
    return {
      transparent: false,
      backgroundColor: '#1a1a2e',
      hasShadow: false
    }
  },

  onWindowCreated(win) {
    void win
  },

  bindContentProtectionEvents(win, reapply) {
    // Every event that may cause macOS to reset NSWindowSharingNone.
    // Captured here so reapply runs synchronously immediately after.
    win.on('focus', reapply)
    win.on('blur', reapply)
    win.on('show', reapply)
    win.on('hide', reapply)
    win.on('move', reapply)
    win.on('resize', reapply)
    win.on('minimize', reapply)
    win.on('restore', reapply)
    win.on('maximize', reapply)
    win.on('unmaximize', reapply)
    win.on('enter-full-screen', reapply)
    win.on('leave-full-screen', reapply)
    win.webContents.on('did-finish-load', reapply)
  },

  applyContentProtection(win, enabled) {
    if (win.isDestroyed()) return
    cpActive = enabled
    if (enabled) {
      // Reduce the OS surfaces where this window appears in screen capture.
      applyProtectedSurface(win)
      startHeartbeat(win)
      burstReapply(win)
    } else {
      try { win.setHiddenInMissionControl(false) } catch { console.warn('[darwin] setHiddenInMissionControl(false) failed') }
      stopHeartbeat()
      win.setContentProtection(false)
    }
  },

  applyOverlayMode(win, enabled) {
    win.setBackgroundColor('#1a1a2e')
    win.setOpacity(enabled ? 0.88 : 1.0)
    if (cpActive) burstReapply(win)
  },

  setAlwaysOnTop(win, flag) {
    win.setAlwaysOnTop(flag, 'screen-saver')
    // setVisibleOnAllWorkspaces resets NSWindowSharingNone on macOS — Zoom
    // and Teams can capture the window during the gap before the heartbeat
    // fires. Re-apply immediately, then again on the next tick to cover the
    // post-AppKit-flush window where the OS resets the sharing flag.
    win.setVisibleOnAllWorkspaces(flag, { visibleOnFullScreen: true, skipTransformProcessType: true })
    if (cpActive && !win.isDestroyed()) {
      burstReapply(win)
    }
  },

  setSkipTaskbar(win, flag) {
    void win
    void flag
  },

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
    // Apply immediately — any debounce delay is a window for screen capture
    // to grab a frame containing the app.
    return 0
  },

  cleanup() {
    stopHeartbeat()
  }
}

export default darwin
