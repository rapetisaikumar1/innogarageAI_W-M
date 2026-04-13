import { app, shell, BrowserWindow, ipcMain, net, desktopCapturer } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, ChildProcess } from 'child_process'
import icon from '../../resources/icon.png?asset'

// Ensure AudioContext.resume() works from non-gesture context (useEffect)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null

function getProjectRoot(): string {
  // In dev, __dirname is out/main, so go up 2 levels
  // In production, adjust accordingly
  return join(__dirname, '../../')
}

function startServer(): void {
  const projectRoot = getProjectRoot()
  const serverPath = join(projectRoot, 'src/server/index.ts')

  serverProcess = spawn('npx', ['tsx', serverPath], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: 'pipe',
    shell: true
  })

  serverProcess.stdout?.on('data', (data) => console.log(`[server] ${data}`))
  serverProcess.stderr?.on('data', (data) => {
    const msg = data.toString()
    // Filter out normal startup logs
    if (!msg.includes('ExperimentalWarning')) {
      console.error(`[server] ${msg}`)
    }
  })
  serverProcess.on('exit', (code) => {
    console.log(`[server] Process exited with code ${code}`)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: true,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
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
    mainWindow.setVisibleOnAllWorkspaces(flag, { visibleOnFullScreen: true })
  }
})

ipcMain.on('window:setOverlayMode', (_event, flag: boolean) => {
  if (mainWindow) {
    mainWindow.setBackgroundColor(flag ? '#00000000' : '#00000000')
    // Hide this window from screen captures when overlay is active.
    // Prevents Gemini from reading our own Q&A panel and returning it as a code suggestion.
    mainWindow.setContentProtection(flag)
  }
})

ipcMain.on('window:setContentProtection', (_event, flag: boolean) => {
  mainWindow?.setContentProtection(flag)
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
ipcMain.handle('audio:get-desktop-source-id', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    if (sources.length > 0) {
      return sources[0].id
    }
    return null
  } catch {
    return null
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
        const urlRes = await net.fetch('http://localhost:3847/auth/google/url')
        const { url } = (await urlRes.json()) as { url: string }

        const authWindow = new BrowserWindow({
          width: 520,
          height: 680,
          parent: mainWindow ?? undefined,
          modal: true,
          show: false,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          }
        })

        authWindow.once('ready-to-show', () => authWindow.show())

        authWindow.on('closed', () => {
          settle(() => reject(new Error('Authentication cancelled')))
        })

        injectBackButton(authWindow)

        authWindow.webContents.on('will-redirect', (_event, redirectUrl) => {
          if (redirectUrl.startsWith('http://localhost:3847/auth/google/callback')) {
            _event.preventDefault()
            net
              .fetch(redirectUrl)
              .then(async (r) => {
                const data = await r.json()
                if (!r.ok) throw new Error((data as { error?: string }).error || 'Google sign-in failed')
                return data
              })
              .then((data) => {
                settle(() => resolve(data as GoogleAuthResult))
                authWindow.destroy()
              })
              .catch((err) => {
                settle(() => reject(err))
                authWindow.destroy()
              })
          }
        })

        authWindow.loadURL(url)
      } catch (err) {
        settle(() => reject(err))
      }
    })
  }
)

// In-app Google identity verify — opens Google sign-in, returns {email, googleId, name} WITHOUT touching DB
// Used during registration to verify the user owns the email they entered
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
        const urlRes = await net.fetch(`http://localhost:3847/auth/google/url${hintParam}`)
        const { url } = (await urlRes.json()) as { url: string }

        const authWindow = new BrowserWindow({
          width: 520,
          height: 680,
          parent: mainWindow ?? undefined,
          modal: true,
          show: false,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          }
        })

        authWindow.once('ready-to-show', () => authWindow.show())

        authWindow.on('closed', () => {
          settle(() => reject(new Error('Authentication cancelled')))
        })

        injectBackButton(authWindow)

        // Intercept the Google callback and redirect to /identity instead of /callback
        authWindow.webContents.on('will-redirect', (_event, redirectUrl) => {
          if (redirectUrl.startsWith('http://localhost:3847/auth/google/callback')) {
            _event.preventDefault()
            // Swap callback → identity to get Google user info without DB ops
            const identityUrl = redirectUrl.replace(
              '/auth/google/callback',
              '/auth/google/identity'
            )
            net
              .fetch(identityUrl)
              .then((r) => r.json())
              .then((data) => {
                settle(() => resolve(data as { email: string; googleId: string; name: string }))
                authWindow.destroy()
              })
              .catch((err) => {
                settle(() => reject(err))
                authWindow.destroy()
              })
          }
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

  startServer()
  createWindow()

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
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
})
