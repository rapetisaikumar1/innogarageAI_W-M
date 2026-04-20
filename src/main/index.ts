import { app, shell, BrowserWindow, ipcMain, net, desktopCapturer } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { platform } from './platform'

// Ensure AudioContext.resume() works from non-gesture context (useEffect)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Platform-specific early setup (before app ready)
platform.earlySetup()

let mainWindow: BrowserWindow | null = null

// ── Content protection state ────────────────────────────────────────────────
let desiredContentProtection = false
let cpTimer: ReturnType<typeof setTimeout> | null = null

function scheduleContentProtection(delayMs?: number): void {
  const delay = delayMs ?? platform.contentProtectionDelay()
  if (cpTimer) clearTimeout(cpTimer)
  cpTimer = setTimeout(() => {
    cpTimer = null
    if (!mainWindow) return
    platform.applyContentProtection(mainWindow, desiredContentProtection)
  }, delay)
}

// ── Window creation ─────────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    ...platform.windowOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  platform.onWindowCreated(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  platform.bindContentProtectionEvents(mainWindow, () => {
    if (desiredContentProtection) scheduleContentProtection(0)
  })

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

// ── IPC: window controls ────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())

ipcMain.on('window:setAlwaysOnTop', (_event, flag: boolean) => {
  if (!mainWindow) return
  platform.setAlwaysOnTop(mainWindow, flag)
  if (desiredContentProtection) scheduleContentProtection(150)
})

ipcMain.on('window:setSkipTaskbar', (_event, flag: boolean) => {
  if (mainWindow) platform.setSkipTaskbar(mainWindow, flag)
})

// ── Content protection state ────────────────────────────────────────────────
// (scheduleContentProtection defined above createWindow)

ipcMain.on('window:setOverlayMode', (_event, flag: boolean) => {
  if (!mainWindow) return
  platform.applyOverlayMode(mainWindow, flag)
  scheduleContentProtection()
})

ipcMain.on('window:setContentProtection', (_event, flag: boolean) => {
  desiredContentProtection = flag
  scheduleContentProtection()
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

// Returns current screen recording permission status
ipcMain.handle('audio:get-screen-permission-status', () => {
  return platform.getScreenPermissionStatus()
})

// Opens OS-specific screen recording/privacy settings
ipcMain.handle('audio:open-screen-settings', () => {
  platform.openScreenSettings()
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
  electronApp.setAppUserModelId(platform.appUserModelId())

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
  if (platform.shouldQuitOnAllClosed()) app.quit()
})

app.on('before-quit', () => {
  platform.cleanup()
})
