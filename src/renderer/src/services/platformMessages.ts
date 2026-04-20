const isMac = window.api.platform === 'darwin'
const isWin = window.api.platform === 'win32'

export const screenSettingsLabel = isMac
  ? 'System Settings > Privacy & Security > Screen & System Audio Recording'
  : isWin
    ? 'Settings > Privacy & Security > Screen capture (ms-settings:privacy-graphicscapturewithoutborder)'
    : 'System privacy settings'

export const screenDeniedMsg = isMac
  ? 'System Settings has been opened. Enable innogarage.ai under "Screen & System Audio Recording", then fully QUIT this app (Cmd+Q) and reopen it.'
  : isWin
    ? 'Windows Settings has been opened. Allow screen capture for innogarage.ai under Privacy & Security, then fully close and reopen the app.'
    : 'Enable screen recording permission in your system settings, then restart the app.'

export const screenStaleMsg = isMac
  ? 'Permission appears enabled but is outdated (app was re-installed). Open System Settings > Privacy & Security > Screen & System Audio Recording, toggle OFF innogarage.ai, then toggle it back ON, fully QUIT this app (Cmd+Q), and reopen it.'
  : isWin
    ? 'Screen capture is enabled but the app cannot access sources. Try fully closing and reopening the app. If the problem persists, uninstall and reinstall innogarage.ai.'
    : 'Permission appears enabled but is outdated. Please restart the app. If the problem persists, reinstall innogarage.ai.'

export const micDeniedMsg = isMac
  ? 'Permission denied. Open System Settings > Privacy & Security > Microphone and enable innogarage.ai.'
  : isWin
    ? 'Permission denied. Open Settings > Privacy & Security > Microphone and enable innogarage.ai.'
    : 'Microphone permission denied. Check your system privacy settings.'
