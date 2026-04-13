/**
 * Screen Capture Pipeline — self-contained, independent of any UI component.
 *
 * Architecture:
 *   Captures screen every 1s → change detection → latest-only queue
 *   → gemini-2.5-pro via /interview/code-suggest → onSuggestion callback
 *
 * Queue behaviour: while AI is busy, new frames overwrite pendingFrame (latest wins).
 * When AI finishes, the latest pending frame (if any) is sent immediately.
 * This ensures the AI always sees the most current screen state.
 */

const CAPTURE_INTERVAL_MS = 2000  // 2s capture cadence
const JPEG_QUALITY = 0.72          // Sharp enough for code OCR; ~20% smaller than 0.8
const BASE_URL = 'http://localhost:3847'
const DEBUG = true

// ── Media state ───────────────────────────────────────────────────────────────
let videoStream: MediaStream | null = null
let videoEl: HTMLVideoElement | null = null
let canvasEl: HTMLCanvasElement | null = null
let captureTimer: ReturnType<typeof setInterval> | null = null
let isCapturing = false

// ── Pipeline state ────────────────────────────────────────────────────────────
let isAIBusy = false           // true while a Gemini request is in flight
let pendingFrame: string | null = null  // latest-only queue — holds most recent unsent frame
let lastFrameSample = ''       // change detection fingerprint

// ── Callbacks (set by startScreenCapture) ────────────────────────────────────
let authToken = ''
let onSuggestionCb: ((result: ScreenSuggestion) => void) | null = null
let onAnalyzingChangeCb: ((analyzing: boolean) => void) | null = null

export interface ScreenSuggestion {
  detected: boolean
  language: string
  context: string
  suggestion: string
  explanation: string
}

function dbg(...args: unknown[]): void {
  if (DEBUG) console.log('[ScreenCapture]', ...args)
}

// ── AI call ───────────────────────────────────────────────────────────────────

async function sendToAI(base64: string): Promise<void> {
  isAIBusy = true
  onAnalyzingChangeCb?.(true)
  dbg('Sending frame to AI — size:', Math.round(base64.length / 1024), 'KB')

  try {
    const res = await fetch(`${BASE_URL}/interview/code-suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ image: base64 })
    })

    if (!res.ok) {
      dbg('AI API error — status:', res.status)
      return
    }

    const result = await res.json() as ScreenSuggestion
    dbg('AI result — detected:', result.detected, 'language:', result.language)
    onSuggestionCb?.(result)

  } catch (err) {
    dbg('AI call failed:', (err as Error).message)
  } finally {
    isAIBusy = false
    onAnalyzingChangeCb?.(false)

    // If a newer frame arrived while we were processing, send it now
    if (pendingFrame && isCapturing) {
      const frame = pendingFrame
      pendingFrame = null
      dbg('Dequeuing latest pending frame')
      sendToAI(frame)
    }
  }
}

// ── Frame capture ─────────────────────────────────────────────────────────────

function captureAndQueue(): void {
  if (!videoEl || !canvasEl || !isCapturing) return
  if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
    dbg('Video not ready')
    return
  }

  canvasEl.width = videoEl.videoWidth
  canvasEl.height = videoEl.videoHeight
  const ctx = canvasEl.getContext('2d')
  if (!ctx) return

  ctx.drawImage(videoEl, 0, 0)
  const dataUrl = canvasEl.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = dataUrl.split(',')[1]
  if (!base64) return

  // Change detection: sample ~512 points across the frame
  const step = Math.floor(base64.length / 512)
  let sample = ''
  for (let i = 0; i < 512; i++) sample += base64[i * step]

  if (sample === lastFrameSample) {
    dbg('Frame unchanged — skipping')
    return
  }
  lastFrameSample = sample

  if (isAIBusy) {
    // AI is busy — store as latest pending (overwrite any older queued frame)
    dbg('AI busy — queuing frame (latest wins)')
    pendingFrame = base64
  } else {
    // AI is free — send immediately
    sendToAI(base64)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ScreenCaptureOptions {
  token: string
  onSuggestion: (result: ScreenSuggestion) => void
  onAnalyzingChange: (analyzing: boolean) => void
}

/**
 * Start the screen capture pipeline.
 * Captures every 1s, queues frames when AI is busy (latest frame wins),
 * sends suggestions via onSuggestion callback.
 */
export async function startScreenCapture(options: ScreenCaptureOptions): Promise<void> {
  stopScreenCapture()

  authToken = options.token
  onSuggestionCb = options.onSuggestion
  onAnalyzingChangeCb = options.onAnalyzingChange

  // Get desktop source ID from Electron main process
  const sourceId = await window.api.getDesktopAudioSourceId()
  if (!sourceId) throw new Error('No screen source available for capture')

  dbg('Starting pipeline, sourceId:', sourceId)

  videoStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        minWidth: 1024,
        maxWidth: 1280,
        minHeight: 576,
        maxHeight: 720
      }
    } as MediaTrackConstraints
  })

  videoEl = document.createElement('video')
  videoEl.srcObject = videoStream
  videoEl.muted = true
  await videoEl.play()

  canvasEl = document.createElement('canvas')
  isCapturing = true

  dbg(`Stream ready — ${videoEl.videoWidth}x${videoEl.videoHeight}, capturing every ${CAPTURE_INTERVAL_MS}ms`)

  // First capture after video stabilizes
  setTimeout(() => { if (isCapturing) captureAndQueue() }, 1500)

  // Recurring 1s captures
  captureTimer = setInterval(() => {
    if (isCapturing) captureAndQueue()
  }, CAPTURE_INTERVAL_MS)
}

/**
 * Stop the pipeline and release all resources.
 */
export function stopScreenCapture(): void {
  dbg('Stopping pipeline')
  isCapturing = false
  pendingFrame = null
  isAIBusy = false

  if (captureTimer) { clearInterval(captureTimer); captureTimer = null }
  if (videoEl) { videoEl.pause(); videoEl.srcObject = null; videoEl = null }
  if (videoStream) { videoStream.getTracks().forEach((t) => t.stop()); videoStream = null }

  canvasEl = null
  onSuggestionCb = null
  onAnalyzingChangeCb = null
  authToken = ''
  lastFrameSample = ''
}

export function isScreenCaptureActive(): boolean {
  return isCapturing
}
