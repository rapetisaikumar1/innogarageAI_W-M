import { app, shell } from 'electron'
import type { PlatformBehavior } from './types'
import icon from '../../../resources/icon.png?asset'

const win32: PlatformBehavior = {
  earlySetup() {
    // Stealth App User Model ID — shows "Microsoft Edge" in Task Manager.
    // NOTE: do NOT call app.disableHardwareAcceleration() — it breaks
    // SetWindowDisplayAffinity which is required for screen capture hiding.
    app.setAppUserModelId('Microsoft.Edge')
  },

  windowOptions() {
    // Transparent windows (WS_EX_LAYERED) are incompatible with
    // SetWindowDisplayAffinity. Use opaque window + setOpacity() for overlay.
    return {
      transparent: false,
      backgroundColor: '#1a1a2e',
      icon
    }
  },

  onWindowCreated(win) {
    // Generic title so Task Manager doesn't expose the app
    win.setTitle('Microsoft Edge')
  },

  bindContentProtectionEvents(win, reapply) {
    // WDA_EXCLUDEFROMCAPTURE can be reset by the OS after ANY window state
    // change. Re-apply on every such event.
    win.on('focus', reapply)
    win.on('show', reapply)
    win.on('move', reapply)
    win.on('resize', reapply)
    win.on('maximize', reapply)
    win.on('unmaximize', reapply)
    win.on('restore', reapply)
  },

  applyContentProtection(win, enabled) {
    win.setContentProtection(enabled)
  },

  applyOverlayMode(win, enabled) {
    // Can't use transparent bg (breaks SetWindowDisplayAffinity).
    // Use window opacity to let the user see through the app.
    win.setOpacity(enabled ? 0.85 : 1.0)
  },

  setAlwaysOnTop(win, flag) {
    win.setAlwaysOnTop(flag, 'screen-saver')
    // Note: setAlwaysOnTop can reset display affinity — caller re-schedules CP
  },

  setSkipTaskbar(win, flag) {
    win.setSkipTaskbar(flag)
  },

  appUserModelId() {
    return 'Microsoft.Edge'
  },

  shouldQuitOnAllClosed() {
    return true
  },

  openScreenSettings() {
    shell.openExternal('ms-settings:privacy-graphicscapturewithoutborder')
  },

  getScreenPermissionStatus() {
    return 'granted' // Windows has no global screen-recording gate
  },

  contentProtectionDelay() {
    return 0
  },

  cleanup() {
    // No cleanup needed
  }
}

export default win32
