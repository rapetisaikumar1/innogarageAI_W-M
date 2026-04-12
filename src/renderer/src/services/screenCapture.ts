/**
 * Screen Capture Pipeline — captures periodic screenshots for AI code analysis.
 *
 * Uses Electron's desktopCapturer source ID + getUserMedia to get a video stream,
 * then extracts frames via an offscreen canvas at a configurable interval.
 */

const CAPTURE_INTERVAL_MS = 4000 // Capture every 4s — tighter cadence now that Gemini latency is lower
const JPEG_QUALITY = 0.72         // Sharp enough for code text OCR; ~20% smaller payload vs 0.8
const DEBUG = true

let videoStream: MediaStream | null = null
let videoEl: HTMLVideoElement | null = null
let canvasEl: HTMLCanvasElement | null = null
let captureTimer: ReturnType<typeof setInterval> | null = null
let isCapturing = false
let frameCallback: ((base64: string) => void) | null = null
let isProcessingFrame = false // Prevent overlapping captures
let lastFrameSample = ''      // Lightweight change detection — skip identical frames

function dbg(...args: unknown[]): void {
  if (DEBUG) console.log('[ScreenCapture]', ...args)
}

/**
 * Start capturing the user's screen at regular intervals.
 * Each captured frame is passed to `onFrame` as a base64 JPEG string.
 */
export async function startScreenCapture(
  onFrame: (base64: string) => void
): Promise<void> {
  // Teardown any prior instance
  stopScreenCapture()

  frameCallback = onFrame

  // Get desktop source ID from Electron main process
  const sourceId = await window.api.getDesktopAudioSourceId()
  if (!sourceId) {
    throw new Error('No screen source available for capture')
  }

  dbg('Starting screen capture, sourceId:', sourceId)

  // Get video stream from desktop source
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

  // Create hidden video element to receive the stream
  videoEl = document.createElement('video')
  videoEl.srcObject = videoStream
  videoEl.muted = true
  await videoEl.play()

  // Create offscreen canvas for frame extraction
  canvasEl = document.createElement('canvas')
  isCapturing = true

  dbg(`Stream started — resolution: ${videoEl.videoWidth}x${videoEl.videoHeight}`)

  // Wait briefly for video to stabilize, then capture first frame
  setTimeout(() => {
    if (isCapturing) captureFrame()
  }, 500)

  // Then capture periodically
  captureTimer = setInterval(() => {
    if (isCapturing && !isProcessingFrame) captureFrame()
  }, CAPTURE_INTERVAL_MS)
}

function captureFrame(): void {
  if (!videoEl || !canvasEl || !frameCallback) return
  if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
    dbg('Video dimensions not ready, skipping frame')
    return
  }

  isProcessingFrame = true

  canvasEl.width = videoEl.videoWidth
  canvasEl.height = videoEl.videoHeight
  const ctx = canvasEl.getContext('2d')
  if (!ctx) {
    isProcessingFrame = false
    return
  }

  ctx.drawImage(videoEl, 0, 0)
  const dataUrl = canvasEl.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = dataUrl.split(',')[1]

  if (base64) {
    // Change detection: sample ~1.5KB spread across the frame — skip if screen hasn't changed
    const step = Math.floor(base64.length / 512)
    let sample = ''
    for (let i = 0; i < 512; i++) sample += base64[i * step]

    if (sample === lastFrameSample) {
      dbg('Frame unchanged — skipping')
      isProcessingFrame = false
      return
    }
    lastFrameSample = sample

    dbg(`Frame captured — ${Math.round(base64.length / 1024)}KB, sending to callback`)
    // NOTE: do NOT reset isProcessingFrame here — markFrameProcessed() will reset it
    // after the server responds. Resetting here caused a race where new frames fired
    // every 3s even while a 6-10s Gemini call was still in flight.
    frameCallback(base64)
  } else {
    isProcessingFrame = false
  }
}

/**
 * Mark frame processing as complete so next capture can proceed.
 * Call this after the server responds to the frame analysis request.
 */
export function markFrameProcessed(): void {
  isProcessingFrame = false
}

/**
 * Temporarily block new captures (while server is processing a frame).
 */
export function markFrameProcessing(): void {
  isProcessingFrame = true
}

/**
 * Stop screen capture and release all resources.
 */
export function stopScreenCapture(): void {
  dbg('Stopping screen capture')
  isCapturing = false

  if (captureTimer) {
    clearInterval(captureTimer)
    captureTimer = null
  }

  if (videoEl) {
    videoEl.pause()
    videoEl.srcObject = null
    videoEl = null
  }

  if (videoStream) {
    videoStream.getTracks().forEach((t) => t.stop())
    videoStream = null
  }

  canvasEl = null
  frameCallback = null
  isProcessingFrame = false
  lastFrameSample = ''
}

export function isScreenCaptureActive(): boolean {
  return isCapturing
}
