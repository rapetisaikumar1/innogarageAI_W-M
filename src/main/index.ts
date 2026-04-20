import { app, shell, BrowserWindow, ipcMain, net, desktopCapturer, systemPreferences } from 'electron'
import { join } from 'path'
import { execFile } from 'child_process'
import { writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// Ensure AudioContext.resume() works from non-gesture context (useEffect)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Windows: transparent windows require disabling hardware acceleration to avoid
// blank/invisible window on certain GPU drivers and older Windows builds
if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
  // Set a neutral App User Model ID so Task Manager shows a generic name
  app.setAppUserModelId('Microsoft.Edge')
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
  // Windows 10 (all builds) + Windows 11: WDA_EXCLUDEFROMCAPTURE can be reset by the OS
  // after ANY window state change (focus, move, resize, maximize, show).
  // Re-apply aggressively on every such event to cover older Win10 builds that reset it more often.
  if (process.platform === 'win32') {
    const reapplyCP = (): void => { if (desiredContentProtection) scheduleContentProtection(0) }
    mainWindow.on('focus',      reapplyCP)
    mainWindow.on('show',       reapplyCP)
    mainWindow.on('move',       reapplyCP)
    mainWindow.on('resize',     reapplyCP)
    mainWindow.on('maximize',   reapplyCP)
    mainWindow.on('unmaximize', reapplyCP)
    mainWindow.on('restore',    reapplyCP)
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
    // Windows: setAlwaysOnTop can reset display affinity — re-apply with native API
    if (process.platform === 'win32' && desiredContentProtection) {
      scheduleContentProtection(150, true)
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

// ── Windows native SetWindowDisplayAffinity via PowerShell ──────────────────
// Electron's setContentProtection(true) only uses WDA_EXCLUDEFROMCAPTURE (0x11)
// which was introduced in Win10 build 2004 (May 2020).  On older Win10 builds
// (1909, 1903, 1809, …) the API silently fails and the window remains fully
// visible to screen capture.
//
// WDA_MONITOR (0x01) has existed since Windows 7 and makes the captured image
// of the window show as a BLACK rectangle — not invisible, but content is hidden.
//
// Strategy:
//   1. Call native API with WDA_EXCLUDEFROMCAPTURE (0x11) first.
//   2. If it fails (older Win10), fall back to WDA_MONITOR (0x01).
//   3. Electron's setContentProtection is still called as belt-and-suspenders
//      for the frequent re-apply events (focus/move/resize) where spawning
//      PowerShell would be too slow.

const WDA_NONE = 0x00
const WDA_MONITOR = 0x01
const WDA_EXCLUDEFROMCAPTURE = 0x11

let affinityScriptPath: string | null = null
let nativeCallPending = false
// Track whether this Win10 build supports WDA_EXCLUDEFROMCAPTURE
let win10UseFallback = false

function getAffinityScript(): string {
  if (!affinityScriptPath) {
    affinityScriptPath = join(app.getPath('temp'), `ig-wda-${process.pid}.ps1`)
    writeFileSync(affinityScriptPath, [
      'param([long]$h,[uint32]$a)',
      "Add-Type 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\"user32.dll\")]public static extern bool SetWindowDisplayAffinity(IntPtr h,uint a);}'",
      '$r=[W]::SetWindowDisplayAffinity([IntPtr]::new($h),$a)',
      'exit $(if($r){0}else{1})'
    ].join('\n'))
  }
  return affinityScriptPath
}

function callNativeAffinity(affinity: number, callback?: () => void): void {
  if (!mainWindow || nativeCallPending) { callback?.(); return }
  nativeCallPending = true
  const hwnd = mainWindow.getNativeWindowHandle()
  const hwndStr = hwnd.byteLength >= 8
    ? hwnd.readBigInt64LE(0).toString()
    : hwnd.readUInt32LE(0).toString()

  execFile('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', getAffinityScript(), '-h', hwndStr, '-a', affinity.toString()
  ], { timeout: 10000 }, (err) => {
    nativeCallPending = false
    if (!err) {
      console.log(`[WDA] Display affinity set to 0x${affinity.toString(16).padStart(2, '0')}`)
      callback?.()
    } else if (affinity === WDA_EXCLUDEFROMCAPTURE) {
      // This Win10 build doesn't support WDA_EXCLUDEFROMCAPTURE — fall back to WDA_MONITOR
      console.log('[WDA] WDA_EXCLUDEFROMCAPTURE unsupported — falling back to WDA_MONITOR')
      win10UseFallback = true
      callNativeAffinity(WDA_MONITOR, callback)
    } else {
      console.error('[WDA] SetWindowDisplayAffinity failed:', err?.message)
      callback?.()
    }
  })
}

// Debounced apply — re-applies content protection after any window state change.
// On Windows: uses Electron API (instant) + native API for initial enable.
function scheduleContentProtection(delayMs = 0, useNative = false): void {
  if (cpTimer) clearTimeout(cpTimer)
  cpTimer = setTimeout(() => {
    cpTimer = null
    if (!mainWindow) return

    // Electron API (synchronous, instant)
    mainWindow.setContentProtection(desiredContentProtection)

    // macOS: call twice — compositor can reset NSWindowSharingNone after first apply
    if (process.platform === 'darwin') {
      setTimeout(() => mainWindow?.setContentProtection(desiredContentProtection), 150)
    }

    // Windows native fallback — only on explicit enable/disable (not frequent re-apply events)
    if (process.platform === 'win32' && useNative) {
      if (desiredContentProtection) {
        // If we already know this build needs WDA_MONITOR, skip the WDA_EXCLUDEFROMCAPTURE attempt
        callNativeAffinity(win10UseFallback ? WDA_MONITOR : WDA_EXCLUDEFROMCAPTURE)
      } else {
        callNativeAffinity(WDA_NONE)
      }
    }
  }, delayMs)
}

ipcMain.on('window:setOverlayMode', (_event, flag: boolean) => {
  if (mainWindow) {
    mainWindow.setBackgroundColor(flag ? '#00000000' : '#1a1a2e')
    // Delay re-application — macOS resets NSWindowSharingType after setBackgroundColor.
    // useNative=true for Windows so WDA_MONITOR fallback is re-applied after bg change.
    scheduleContentProtection(process.platform === 'darwin' ? 150 : 0, process.platform === 'win32')
  }
})

ipcMain.on('window:setContentProtection', (_event, flag: boolean) => {
  desiredContentProtection = flag
  // useNative=true — this is the explicit enable/disable, must call Win32 API
  scheduleContentProtection(process.platform === 'darwin' ? 150 : 0, process.platform === 'win32')
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
  // Clean up temp PowerShell script
  if (affinityScriptPath) {
    try { require('fs').unlinkSync(affinityScriptPath) } catch { /* ignore */ }
  }
})
