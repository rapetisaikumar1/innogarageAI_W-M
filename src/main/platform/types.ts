import type { BrowserWindow } from 'electron'

export interface PlatformBehavior {
  /** Runs before app 'ready' — e.g. setAppUserModelId. */
  earlySetup(): void

  /** Platform-specific BrowserWindow constructor overrides. */
  windowOptions(): Partial<Electron.BrowserWindowConstructorOptions>

  /** Called once right after BrowserWindow is created. */
  onWindowCreated(win: BrowserWindow): void

  /** Bind events that re-apply content protection after OS resets. */
  bindContentProtectionEvents(win: BrowserWindow, reapply: () => void): void

  /** Apply or remove content protection. */
  applyContentProtection(win: BrowserWindow, enabled: boolean): void

  /** Overlay / see-through mode for interview screen. */
  applyOverlayMode(win: BrowserWindow, enabled: boolean): void

  /** Set always-on-top with platform-correct level + side effects. */
  setAlwaysOnTop(win: BrowserWindow, flag: boolean): void

  /** Show / hide the app from the OS taskbar / dock. */
  setSkipTaskbar(win: BrowserWindow, flag: boolean): void

  /** App User Model ID (Windows) or bundle ID (macOS). */
  appUserModelId(): string

  /** True → quit when all windows close. */
  shouldQuitOnAllClosed(): boolean

  /** Open OS screen-recording privacy settings. */
  openScreenSettings(): void

  /** Screen-recording permission status. */
  getScreenPermissionStatus(): string

  /** Default delay (ms) for content protection scheduling. */
  contentProtectionDelay(): number

  /** Cleanup on before-quit. */
  cleanup(): void
}
