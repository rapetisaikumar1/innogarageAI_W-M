import { app, shell, BrowserWindow, ipcMain, net, desktopCapturer, systemPreferences } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// Ensure AudioContext.resume() works from non-gesture context (useEffect)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Windows: transparent windows require disabling hardware acceleration to avoid
// blank/invisible window on certain GPU drivers and older Windows builds
if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Windows: use a generic title so the window doesn't stand out in Task Manager
  // (the Processes tab still shows the .exe name, but the window title is neutral)
  if (process.platform === 'win32') {
    mainWindow.setTitle('Microsoft Edge')
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // macOS resets NSWindowSharingNone on focus, show, and space transitions.
  // Re-apply content protection on each of these events.
  if (process.platform === 'darwin') {
    mainWindow.on('focus', () => { if (desiredContentProtection) scheduleContentProtection(100) })
    mainWindow.on('show',  () => { if (desiredContentProtection) scheduleContentProtection(100) })
    mainWindow.on('enter-full-screen', () => { if (desiredContentProtection) scheduleContentProtection(200) })
  }
  // Windows: re-apply on focus in case WDA_EXCLUDEFROMCAPTURE was reset
  if (process.platform === 'win32') {
    mainWindow.on('focus', () => { if (desiredContentProtection) scheduleContentProtection(0) })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC handlers for window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())
ipcMain.on('window:setAlwaysOnTop', (_event, flag: boolean) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(flag, 'screen-saver')
    // setVisibleOnAllWorkspaces is macOS/Linux only — not available on Windows
    if (process.platform !== 'win32') {
      mainWindow.setVisibleOnAllWorkspaces(flag, { visibleOnFullScreen: true })
    }
    // Windows: setAlwaysOnTop can reset WDA_EXCLUDEFROMCAPTURE — re-apply immediately
    if (process.platform === 'win32' && desiredContentProtection) {
      scheduleContentProtection(50)
    }
  }
})

// Windows: toggle skipTaskbar dynamically when entering/leaving interview mode
ipcMain.on('window:setSkipTaskbar', (_event, flag: boolean) => {
  if (mainWindow && process.platform === 'win32') {
    mainWindow.setSkipTaskbar(flag)
  }
})

// Track desired content protection state — re-applied after any window property change
let desiredContentProtection = false
let cpTimer: ReturnType<typeof setTimeout> | null = null

// Debounced apply — macOS resets NSWindowSharingType asynchronously after
// setBackgroundColor / setAlwaysOnTop / window moves. By debouncing 150ms we
// always fire AFTER macOS finishes its internal window reconfiguration.
function scheduleContentProtection(delayMs = 0): void {
  if (cpTimer) clearTimeout(cpTimer)
  cpTimer = setTimeout(() => {
    cpTimer = null
    if (!mainWindow) return
    mainWindow.setContentProtection(desiredContentProtection)
    // macOS: call twice — once now, once after the next paint — to handle
    // cases where the compositor resets NSWindowSharingNone after first apply.
    if (process.platform === 'darwin') {
      setTimeout(() => {
        if (!mainWindow) return
        mainWindow.setContentProtection(desiredContentProtection)
      }, 150)
    }
  }, delayMs)
}

ipcMain.on('window:setOverlayMode', (_event, flag: boolean) => {
  if (mainWindow) {
    mainWindow.setBackgroundColor(flag ? '#00000000' : '#1a1a2e')
    // Delay re-application — macOS resets NSWindowSharingType after setBackgroundColor.
    // 150ms gives macOS time to finish its internal window reconfiguration first.
    scheduleContentProtection(process.platform === 'darwin' ? 150 : 0)
  }
})

ipcMain.on('window:setContentProtection', (_event, flag: boolean) => {
  desiredContentProtection = flag
  scheduleContentProtection(process.platform === 'darwin' ? 150 : 0)
})

// Open external links
ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url)
})

// Native file download — saves to system Downloads folder
ipcMain.handle('download-file', (_event, url: string) => {
  mainWindow?.webContents.downloadURL(url)
})

// Desktop audio capture — returns source ID for system audio
// Retries up to 3 times with a short delay to handle race after granting permission
ipcMain.handle('audio:get-desktop-source-id', async () => {
  const maxAttempts = 3
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      console.log(`[desktopCapturer] attempt ${i + 1}: sources found:`, sources.length, sources.map(s => s.name))
      if (sources.length > 0) {
        return sources[0].id
      }
    } catch (err) {
      console.error(`[desktopCapturer] attempt ${i + 1} error:`, err)
    }
    if (i < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  return null
})

// Returns current macOS screen recording permission status
ipcMain.handle('audio:get-screen-permission-status', () => {
  if (process.platform !== 'darwin') return 'granted'
  return systemPreferences.getMediaAccessStatus('screen')
})

// Opens OS-specific screen recording/privacy settings
ipcMain.handle('audio:open-screen-settings', () => {
  if (process.platform === 'darwin') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  } else if (process.platform === 'win32') {
    shell.openExternal('ms-settings:privacy-graphicscapturewithoutborder')
  }
})

// Injects a floating "← Cancel" button into a Google OAuth BrowserWindow.
// Electron's executeJavaScript bypasses page CSP, so this works on Google's pages.
function injectBackButton(win: BrowserWindow): void {
  win.webContents.on('did-finish-load', () => {
    win.webContents
      .executeJavaScript(`
        (function () {
          if (document.getElementById('__ig_back_btn')) return;
          var btn = document.createElement('button');
          btn.id = '__ig_back_btn';
          btn.textContent = '\u2190 Cancel';
          btn.style.cssText = [
            'position:fixed',
            'top:12px',
            'left:12px',
            'z-index:2147483647',
            'background:rgba(255,255,255,0.96)',
            'border:1px solid #dadce0',
            'border-radius:6px',
            'padding:7px 16px',
            'font-size:13px',
            'font-family:Google Sans,Roboto,sans-serif',
            'font-weight:500',
            'color:#3c4043',
            'cursor:pointer',
            'box-shadow:0 1px 6px rgba(32,33,36,0.18)',
            'transition:background 0.15s'
          ].join(';');
          btn.onmouseenter = function () { btn.style.background = '#f1f3f4'; };
          btn.onmouseleave = function () { btn.style.background = 'rgba(255,255,255,0.96)'; };
          btn.onclick = function () { window.close(); };
          document.body.appendChild(btn);
        })();
      `)
      .catch(function () {})
  })
}

type GoogleAuthResult =
  | { type: 'login'; token: string; user: { id: string; name: string; email: string; phone: string | null } }
  | { type: 'verify'; email: string; name: string; googleId: string }

const RAILWAY_CALLBACK = 'https://innogarage-ai-production.up.railway.app/auth/google/callback'

// Shared helper: intercepts Google OAuth callback in a modal window.
// Handles both will-redirect (server 302) and did-navigate (window loads the URL).
function interceptGoogleCallback(
  authWindow: BrowserWindow,
  onUrl: (url: string) => void
): void {
  authWindow.webContents.on('will-redirect', (_event, redirectUrl) => {
    if (redirectUrl.startsWith(RAILWAY_CALLBACK)) {
      _event.preventDefault()
      onUrl(redirectUrl)
    }
  })
  authWindow.webContents.on('did-navigate', (_event, redirectUrl) => {
    if (redirectUrl.startsWith(RAILWAY_CALLBACK)) {
      onUrl(redirectUrl)
    }
  })
}

// In-app Google OAuth — opens a modal BrowserWindow, intercepts callback
ipcMain.handle(
  'auth:google',
  (): Promise<GoogleAuthResult> => {
    return new Promise(async (resolve, reject) => {
      let settled = false
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        fn()
      }

      try {
        const urlRes = await net.fetch('https://innogarage-ai-production.up.railway.app/auth/google/url')
        const { url } = (await urlRes.json()) as { url: string }

        const authWindow = new BrowserWindow({
          width: 520,
          height: 680,
          parent: mainWindow ?? undefined,
          modal: true,
          show: false,
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
        })

        authWindow.once('ready-to-show', () => authWindow.show())
        authWindow.on('closed', () => settle(() => reject(new Error('Authentication cancelled'))))
        injectBackButton(authWindow)

        interceptGoogleCallback(authWindow, (callbackUrl) => {
          net
            .fetch(callbackUrl)
            .then(async (r) => {
              const data = await r.json()
              if (!r.ok) throw new Error((data as { error?: string }).error || 'Google sign-in failed')
              return data
            })
            .then((data) => { settle(() => resolve(data as GoogleAuthResult)); authWindow.destroy() })
            .catch((err) => { settle(() => reject(err)); authWindow.destroy() })
        })

        authWindow.loadURL(url)
      } catch (err) {
        settle(() => reject(err))
      }
    })
  }
)

// In-app Google identity verify — opens Google sign-in, returns {email, googleId, name} WITHOUT touching DB
ipcMain.handle(
  'auth:google-verify',
  (_event, loginHint?: string): Promise<{ email: string; googleId: string; name: string }> => {
    return new Promise(async (resolve, reject) => {
      let settled = false
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        fn()
      }

      try {
        const hintParam = loginHint ? `?hint=${encodeURIComponent(loginHint)}` : ''
        const urlRes = await net.fetch(`https://innogarage-ai-production.up.railway.app/auth/google/url${hintParam}`)
        const { url } = (await urlRes.json()) as { url: string }

        const authWindow = new BrowserWindow({
          width: 520,
          height: 680,
          parent: mainWindow ?? undefined,
          modal: true,
          show: false,
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
        })

        authWindow.once('ready-to-show', () => authWindow.show())
        authWindow.on('closed', () => settle(() => reject(new Error('Authentication cancelled'))))
        injectBackButton(authWindow)

        interceptGoogleCallback(authWindow, (callbackUrl) => {
          const identityUrl = callbackUrl.replace('/auth/google/callback', '/auth/google/identity')
          net
            .fetch(identityUrl)
            .then((r) => r.json())
            .then((data) => { settle(() => resolve(data as { email: string; googleId: string; name: string })); authWindow.destroy() })
            .catch((err) => { settle(() => reject(err)); authWindow.destroy() })
        })

        authWindow.loadURL(url)
      } catch (err) {
        settle(() => reject(err))
      }
    })
  }
)

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.innogarage')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Recover from renderer crashes by recreating the window
  app.on('render-process-gone', (_event, _webContents, details) => {
    console.error('[main] Renderer process gone:', details.reason)
    if (details.reason !== 'clean-exit') {
      mainWindow = null
      createWindow()
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
})
