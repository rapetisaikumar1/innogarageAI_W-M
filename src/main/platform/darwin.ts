import { shell, systemPreferences } from 'electron'
import type { PlatformBehavior } from './types'

const darwin: PlatformBehavior = {
  earlySetup() {
    // No early setup needed on macOS
  },

  windowOptions() {
    return {
      transparent: true,
      backgroundColor: '#00000000'
      // No icon on macOS — uses the .app bundle icon
    }
  },

  onWindowCreated(_win) {
    // No post-create tweaks on macOS
  },

  bindContentProtectionEvents(win, reapply) {
    // macOS resets NSWindowSharingNone on focus, show, and space transitions
    win.on('focus', reapply)
    win.on('show', reapply)
    win.on('enter-full-screen', reapply)
  },

  applyContentProtection(win, enabled) {
    win.setContentProtection(enabled)
    // macOS compositor can reset NSWindowSharingNone after the first call
    setTimeout(() => win.setContentProtection(enabled), 150)
  },

  applyOverlayMode(win, enabled) {
    win.setBackgroundColor(enabled ? '#00000000' : '#1a1a2e')
  },

  setAlwaysOnTop(win, flag) {
    win.setAlwaysOnTop(flag, 'screen-saver')
    win.setVisibleOnAllWorkspaces(flag, { visibleOnFullScreen: true })
  },

  setSkipTaskbar(_win, _flag) {
    // macOS doesn't have a taskbar hide equivalent via this API
  },

  appUserModelId() {
    return 'com.innogarage'
  },

  shouldQuitOnAllClosed() {
    return false // macOS convention: keep app alive
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
    return 150 // macOS needs a delay after NSWindowSharingType resets
  },

  cleanup() {
    // No cleanup needed
  }
}

export default darwin
