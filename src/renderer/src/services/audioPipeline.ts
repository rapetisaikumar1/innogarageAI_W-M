/**
 * Audio Pipeline — Voice Activity Detection (VAD) based.
 *
 * Key fixes:
 *  - AudioContext.resume() called explicitly (Electron starts it suspended)
 *  - setupAnalyser is async so pipeline waits until context is running
 *  - Debug logging so RMS values are visible in DevTools console
 */

const BASE_URL = 'http://localhost:3847'

// VAD tuning
const SILENCE_THRESHOLD = 0.008  // RMS below this = silence (tuned for processed audio on macOS)
const SILENCE_DURATION_MS = 1200  // silence gate before sending utterance
const MIN_UTTERANCE_MS = 250      // discard blobs shorter than this (noise)
const POLL_INTERVAL_MS = 50       // level check interval
const DEBUG = true               // set false to silence console logs

type AudioSource = 'mic' | 'system'

interface AudioPipelineCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void
  onError: (error: string) => void
  onStateChange: (state: 'idle' | 'listening' | 'error') => void
}

// ── Module state ──────────────────────────────────────────────────────────────

let mediaStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let mediaRecorder: MediaRecorder | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null
let currentSource: AudioSource = 'mic'
let callbacks: AudioPipelineCallbacks | null = null
let isRunning = false
let mimeType = ''

// VAD state
let isSpeaking = false
let silenceMs = 0
let utteranceStartMs = 0
let recordingChunks: BlobPart[] = []
let logCounter = 0  // throttle RMS logs

function dbg(...args: unknown[]): void {
  if (DEBUG) console.log('[AudioPipeline]', ...args)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ]
  // Log support status for all candidates so we know exactly what this browser can do
  dbg('─── STAGE 0: MIME TYPE DETECTION ───')
  for (const type of candidates) {
    const supported = MediaRecorder.isTypeSupported(type)
    dbg(`  ${supported ? '✓' : '✗'} ${type}`)
    if (supported) return type
  }
  dbg('  ! No candidate matched — falling back to audio/webm')
  return 'audio/webm'
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function sendForTranscription(blob: Blob): Promise<void> {
  const cbs = callbacks  // capture before any async gap
  if (!cbs) { dbg('STAGE 6: sendForTranscription — no callbacks, aborting'); return }

  const utteranceDuration = Date.now() - utteranceStartMs
  dbg(`─── STAGE 6: SEND FOR TRANSCRIPTION ───`)
  dbg(`  utterance duration : ${utteranceDuration}ms`)
  dbg(`  blob size          : ${blob.size} bytes`)
  dbg(`  blob type          : ${blob.type}`)
  dbg(`  mimeType (module)  : ${mimeType}`)
  dbg(`  token present      : ${!!localStorage.getItem('token')}`)

  if (utteranceDuration < MIN_UTTERANCE_MS || blob.size < 1500) {
    dbg(`  ✗ DISCARDED — duration < ${MIN_UTTERANCE_MS}ms OR size < 1500 bytes`)
    return
  }

  dbg('  ✓ Utterance valid — converting to base64...')
  try {
    const base64 = await blobToBase64(blob)
    dbg(`  base64 length: ${base64.length} chars`)
    const token = localStorage.getItem('token')
    const mimeForServer = mimeType.split(';')[0]
    dbg(`  mimeType sent to server: ${mimeForServer}`)

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      dbg('  ✗ Transcription request timed out after 45s')
      controller.abort()
    }, 45000)

    dbg(`  → POST ${BASE_URL}/interview/transcribe`)
    const res = await fetch(`${BASE_URL}/interview/transcribe`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        audio: base64,
        mimeType: mimeForServer
      })
    })
    clearTimeout(timeout)

    dbg(`  ← HTTP ${res.status} ${res.statusText}`)

    if (res.ok) {
      const data = (await res.json()) as { text: string }
      dbg(`  ✓ Transcribed text: "${data.text}"`)
      if (data.text?.trim()) {
        dbg('  → calling onTranscript callback')
        cbs.onTranscript(data.text.trim(), true)
      } else {
        dbg('  ! Server returned empty/NO_SPEECH text')
      }
    } else {
      let errDetail = `HTTP ${res.status}`
      try {
        const body = await res.json()
        errDetail = body.details || body.error || errDetail
      } catch {
        errDetail = (await res.text().catch(() => errDetail)) || errDetail
      }
      dbg(`  ✗ Server error: ${errDetail}`)
      cbs.onError(`Transcription failed: ${errDetail}`)
    }
  } catch (err) {
    dbg('  ✗ sendForTranscription threw:', err)
  }
}

function getRMS(node: AnalyserNode): number {
  const buf = new Uint8Array(node.fftSize)
  node.getByteTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / buf.length)
}

// ── Recording control ─────────────────────────────────────────────────────────

function startRecording(): void {
  dbg('─── STAGE 4: START RECORDING ───')
  if (!mediaStream || !mediaStream.active) {
    dbg('  ✗ stream not active, aborting')
    return
  }
  dbg(`  stream active: ${mediaStream.active}`)
  dbg(`  audio tracks : ${mediaStream.getAudioTracks().map(t => `${t.label} readyState=${t.readyState} muted=${t.muted}`).join(', ')}`)
  recordingChunks = []
  utteranceStartMs = Date.now()
  dbg(`  mimeType: ${mimeType}`)

  // Try with explicit mimeType first; fall back to browser default if it rejects
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(mediaStream, { mimeType })
    dbg('  MediaRecorder constructor ✓ (with mimeType)')
  } catch {
    dbg('  mimeType rejected by MediaRecorder constructor, using browser default')
    mimeType = ''
    try {
      recorder = new MediaRecorder(mediaStream)
      dbg('  MediaRecorder constructor ✓ (fallback, no mimeType)')
    } catch (err2) {
      dbg('  ✗ MediaRecorder constructor failed entirely:', err2)
      if (isRunning) callbacks?.onError((err2 as Error).message)
      return
    }
  }

  mediaRecorder = recorder
  // Read back actual mimeType chosen by browser (matters when we fell back)
  if (!mimeType) mimeType = recorder.mimeType || 'audio/webm'
  dbg(`  actual mimeType in use: ${mimeType}`)

  let chunkCount = 0
  recorder.ondataavailable = (e: BlobEvent) => {
    chunkCount++
    dbg(`  ondataavailable #${chunkCount} — ${e.data.size} bytes`)
    if (e.data.size > 0) recordingChunks.push(e.data)
  }

  recorder.onerror = (e) => {
    dbg('  ✗ MediaRecorder onerror:', e)
    if (isRunning) callbacks?.onError('Recording error: ' + String(e))
  }

  try {
    recorder.start(100)  // emit chunks every 100ms so data arrives even on abrupt stop
    dbg(`  ✓ MediaRecorder.start(100) — state: ${recorder.state}`)
  } catch (err) {
    dbg('  ✗ MediaRecorder.start() failed:', err)
    mediaRecorder = null
    if (isRunning) callbacks?.onError((err as Error).message)
  }
}

function stopRecordingAndSend(): void {
  dbg('─── STAGE 5: STOP RECORDING ───')
  const recorder = mediaRecorder
  if (!recorder || recorder.state === 'inactive') {
    dbg(`  ✗ recorder is ${recorder ? 'inactive' : 'null'}, skipping`)
    return
  }

  dbg(`  recorder state: ${recorder.state} | chunks so far: ${recordingChunks.length}`)

  recorder.onstop = async () => {
    const blob = new Blob(recordingChunks, { type: mimeType })
    dbg(`  ✓ onstop fired — blob: ${blob.size} bytes, type: ${blob.type}, chunks: ${recordingChunks.length}`)
    recordingChunks = []
    await sendForTranscription(blob)
  }

  try { recorder.stop(); dbg('  recorder.stop() called') } catch (err) { dbg('  ✗ recorder.stop() error:', err) }
  mediaRecorder = null
}

// ── VAD loop ──────────────────────────────────────────────────────────────────

function startVADLoop(): void {
  if (!analyser) {
    dbg('startVADLoop: no analyser, aborting')
    return
  }

  isSpeaking = false
  silenceMs = 0
  logCounter = 0

  dbg('─── STAGE 3: VAD LOOP STARTED ───')
  dbg(`  threshold    : ${SILENCE_THRESHOLD}`)
  dbg(`  silence gate : ${SILENCE_DURATION_MS}ms`)
  dbg(`  poll interval: ${POLL_INTERVAL_MS}ms`)
  dbg(`  ctx state    : ${audioContext?.state}`)
  dbg(`  ctx sampleRate: ${audioContext?.sampleRate}Hz`)

  // Log every poll for the first 5s to verify signal is alive
  const VERBOSE_POLLS = 50

  pollInterval = setInterval(async () => {
    if (!isRunning || !analyser) return

    // Recheck AudioContext — Electron/macOS can re-suspend mid-session
    if (audioContext && audioContext.state !== 'running') {
      dbg(`  AudioContext state='${audioContext.state}' — resuming...`)
      try { await audioContext.resume() } catch { /* ignore */ }
    }

    const rms = getRMS(analyser)
    logCounter++

    // Verbose for first 5s, then throttle to every 1s
    if (logCounter <= VERBOSE_POLLS || logCounter % 10 === 0) {
      dbg(`  [${logCounter}] RMS=${rms.toFixed(6)} speaking=${isSpeaking} silence=${silenceMs}ms ctx=${audioContext?.state}`)
    }

    const hasSpeech = rms > SILENCE_THRESHOLD

    if (hasSpeech) {
      silenceMs = 0
      if (!isSpeaking) {
        // Start recording on the VERY FIRST speech sample — no delay, no missed words
        dbg(`  ─── STAGE 3→4: SPEECH TRIGGERED rms=${rms.toFixed(6)} > threshold=${SILENCE_THRESHOLD} ───`)
        isSpeaking = true
        startRecording()
      }
    } else {
      if (isSpeaking) {
        silenceMs += POLL_INTERVAL_MS

        if (silenceMs >= SILENCE_DURATION_MS) {
          dbg('Silence timeout — stopping and sending')
          isSpeaking = false
          silenceMs = 0
          stopRecordingAndSend()
        }
      }
    }
  }, POLL_INTERVAL_MS)
}

// ── Stream helpers ────────────────────────────────────────────────────────────

async function getMicStream(): Promise<MediaStream> {
  dbg('─── STAGE 1: GET MIC STREAM ───')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })
  const tracks = stream.getAudioTracks()
  dbg(`  ✓ got ${tracks.length} audio track(s)`)
  for (const t of tracks) {
    const s = t.getSettings()
    dbg(`    label       : ${t.label}`)
    dbg(`    readyState  : ${t.readyState}`)
    dbg(`    enabled     : ${t.enabled}`)
    dbg(`    muted       : ${t.muted}`)
    dbg(`    sampleRate  : ${s.sampleRate ?? 'n/a'}`)
    dbg(`    channelCount: ${s.channelCount ?? 'n/a'}`)
    dbg(`    deviceId    : ${s.deviceId ?? 'n/a'}`)
  }
  return stream
}

async function getSystemAudioStream(): Promise<MediaStream> {
  const sourceId = await window.api.getDesktopAudioSourceId()
  if (!sourceId) throw new Error('No screen source available for system audio capture')
  dbg('System audio sourceId:', sourceId)

  return navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId
      }
    } as MediaTrackConstraints,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        minWidth: 1,
        maxWidth: 1,
        minHeight: 1,
        maxHeight: 1
      }
    } as MediaTrackConstraints
  })
}

async function setupAnalyser(stream: MediaStream): Promise<void> {
  dbg('─── STAGE 2: SETUP AUDIO CONTEXT ───')
  audioContext = new AudioContext()
  dbg(`  created — state: ${audioContext.state}, sampleRate: ${audioContext.sampleRate}Hz`)

  if (audioContext.state === 'suspended') {
    dbg('  suspended — calling resume()...')
    await audioContext.resume()
    dbg(`  after resume — state: ${audioContext.state}`)
  } else {
    dbg(`  state OK: ${audioContext.state}`)
  }

  analyser = audioContext.createAnalyser()
  analyser.fftSize = 2048
  const src = audioContext.createMediaStreamSource(stream)
  src.connect(analyser)
  dbg(`  ✓ Analyser connected — fftSize: ${analyser.fftSize}`)

  // Sanity check: read one RMS immediately to confirm signal flows
  const buf = new Uint8Array(analyser.fftSize)
  analyser.getByteTimeDomainData(buf)
  const immediateSum = Array.from(buf).reduce((s, v) => s + Math.abs(v - 128), 0)
  dbg(`  immediate signal check (sum|v-128|): ${immediateSum} — ${immediateSum === 0 ? '⚠ FLAT (context may be broken)' : '✓ signal present'}`)
}

function teardown(): void {
  dbg('Teardown called')
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = null
    try { mediaRecorder.stop() } catch { /* ignore */ }
    mediaRecorder = null
  }
  if (audioContext) {
    audioContext.close().catch(() => {})
    audioContext = null
    analyser = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
  isSpeaking = false
  silenceMs = 0
  recordingChunks = []
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startAudioPipeline(
  source: AudioSource,
  cbs: AudioPipelineCallbacks
): Promise<void> {
  // Always tear down any prior instance — handles React StrictMode's double-invoke in dev
  teardown()
  callbacks = cbs
  currentSource = source
  isRunning = true
  mimeType = getSupportedMimeType()
  dbg('startAudioPipeline called. source:', source, '| mimeType:', mimeType)

  try {
    mediaStream = source === 'system'
      ? await getSystemAudioStream()
      : await getMicStream()

    await setupAnalyser(mediaStream)
    startVADLoop()
    callbacks.onStateChange('listening')
    dbg('Pipeline fully started')
  } catch (err) {
    dbg('startAudioPipeline error:', err)
    isRunning = false
    callbacks.onError((err as Error).message)
    callbacks.onStateChange('error')
    throw err
  }
}

export function stopAudioPipeline(): void {
  dbg('stopAudioPipeline called')
  isRunning = false
  teardown()
  callbacks?.onStateChange('idle')
}

export async function switchAudioSource(newSource: AudioSource): Promise<void> {
  if (newSource === currentSource || !isRunning || !callbacks) return
  dbg('switchAudioSource:', currentSource, '->', newSource)

  const cbs = callbacks
  teardown()
  isRunning = true
  currentSource = newSource
  mimeType = getSupportedMimeType()

  try {
    mediaStream = newSource === 'system'
      ? await getSystemAudioStream()
      : await getMicStream()

    await setupAnalyser(mediaStream)
    startVADLoop()
  } catch (err) {
    dbg('switchAudioSource error:', err)
    cbs.onError((err as Error).message)
    cbs.onStateChange('error')
  }
}

export async function checkMicPermission(): Promise<boolean> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return result.state === 'granted'
  } catch {
    return false
  }
}

export function getCurrentSource(): AudioSource { return currentSource }
export function isPipelineRunning(): boolean { return isRunning }
