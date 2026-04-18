/**
 * Audio Pipeline — Deepgram Nova-3 WebSocket streaming.
 *
 * Architecture:
 *   Mic/System audio → AudioContext (16kHz mono) → ScriptProcessor → Int16 PCM
 *   → WebSocket → local server proxy → Deepgram Nova-3
 *   → interim/final transcripts → onTranscript callback
 *
 * On `speechFinal` (Deepgram utterance boundary ~200ms after speaking stops)
 * the final transcript fires immediately — no silence gate, no blob encoding.
 */

const WS_URL   = 'wss://innogarage-ai-production.up.railway.app'
export const BASE_URL = 'https://innogarage-ai-production.up.railway.app'
const DEBUG    = true
const TARGET_SAMPLE_RATE = 16000  // Deepgram linear16 expects 16kHz
const MAX_WS_RECONNECTS = 3      // auto-reconnect up to 3 times on transient disconnect

type AudioSource = 'mic' | 'system'

interface AudioPipelineCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void
  onError: (error: string) => void
  onStateChange: (state: 'idle' | 'listening' | 'error') => void
}

// ── Module state ──────────────────────────────────────────────────────────────

let mediaStream:     MediaStream | null         = null
let audioContext:    AudioContext | null        = null
let processor:       ScriptProcessorNode | null = null
let wsConn:          WebSocket | null           = null
let currentSource:   AudioSource               = 'mic'
let callbacks:       AudioPipelineCallbacks | null = null
let isRunning        = false
let wsReconnects     = 0

function dbg(...args: unknown[]): void {
  if (DEBUG) console.log('[AudioPipeline]', ...args)
}

// ── Float32 → Int16 PCM conversion ───────────────────────────────────────────

function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

// ── WebSocket connection to server proxy ──────────────────────────────────────

function openWebSocket(token: string): WebSocket {
  const url = `${WS_URL}/interview/stream?token=${encodeURIComponent(token)}`
  dbg('Opening WebSocket:', url)
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => dbg('WebSocket open ✓')

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as {
        type: string
        text?: string
        isFinal?: boolean
        speechFinal?: boolean
        message?: string
      }

      if (msg.type === 'transcript' && msg.text?.trim()) {
        const text = msg.text.trim()
        const isFinal = msg.speechFinal === true  // utterance boundary = truly final
        dbg(`  ← transcript isFinal=${isFinal} speechFinal=${msg.speechFinal} text="${text}"`)
        callbacks?.onTranscript(text, isFinal)
      } else if (msg.type === 'error') {
        dbg('  ← Deepgram error:', msg.message)
        if (isRunning) callbacks?.onError(`Deepgram error: ${msg.message}`)
      }
    } catch (err) {
      dbg('  ← failed to parse WS message:', err)
    }
  }

  ws.onerror = (e) => {
    dbg('WebSocket error:', e)
    if (isRunning) callbacks?.onError('WebSocket connection error')
  }

  ws.onclose = (e) => {
    dbg(`WebSocket closed: code=${e.code} reason=${e.reason}`)
    if (isRunning && e.code !== 1000 && e.code !== 4001) {
      // Transient disconnect — try to reconnect
      if (wsReconnects < MAX_WS_RECONNECTS) {
        wsReconnects++
        const delay = wsReconnects * 1000 // 1s, 2s, 3s backoff
        dbg(`Attempting WS reconnect #${wsReconnects} in ${delay}ms`)
        setTimeout(() => {
          if (!isRunning) return
          try {
            wsConn = openWebSocket(token)
          } catch {
            callbacks?.onError('Failed to reconnect audio stream')
          }
        }, delay)
      } else {
        callbacks?.onError(`Stream disconnected (${e.code})`)
      }
    }
  }

  return ws
}

// ── Stream helpers ────────────────────────────────────────────────────────────

async function getMicStream(): Promise<MediaStream> {
  dbg('─── GET MIC STREAM ───')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: TARGET_SAMPLE_RATE,
      channelCount: 1
    }
  })
  dbg(`  ✓ ${stream.getAudioTracks().map(t => t.label).join(', ')}`)
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

// ── AudioContext + ScriptProcessor setup ─────────────────────────────────────

let silentGain: GainNode | null = null

async function setupAudioCapture(stream: MediaStream): Promise<void> {
  dbg('─── SETUP AUDIO CONTEXT ───')
  audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  dbg(`  created — state: ${audioContext.state}, sampleRate: ${audioContext.sampleRate}Hz`)

  if (audioContext.state === 'suspended') {
    await audioContext.resume()
    dbg(`  resumed — state: ${audioContext.state}`)
  }

  const source = audioContext.createMediaStreamSource(stream)

  // bufferSize 2048 = ~128ms of audio at 16kHz — lower latency
  processor = audioContext.createScriptProcessor(2048, 1, 1)
  processor.onaudioprocess = (e) => {
    if (!isRunning || wsConn?.readyState !== WebSocket.OPEN) return
    const float32 = e.inputBuffer.getChannelData(0)
    const int16 = float32ToInt16(float32)
    wsConn.send(int16.buffer)
  }

  // Use a silent gain node to keep the processor in the audio graph
  // without routing mic audio to speakers (which caused echo/feedback
  // and system audio bleeding into mic transcriptions)
  silentGain = audioContext.createGain()
  silentGain.gain.value = 0

  source.connect(processor)
  processor.connect(silentGain)
  silentGain.connect(audioContext.destination)
  dbg('  ✓ ScriptProcessor connected via silent gain — streaming PCM to WebSocket')
}

// ── Teardown ──────────────────────────────────────────────────────────────────

function teardown(): void {
  dbg('Teardown called')

  if (processor) {
    processor.disconnect()
    processor.onaudioprocess = null
    processor = null
  }
  if (silentGain) {
    silentGain.disconnect()
    silentGain = null
  }
  if (audioContext) {
    audioContext.close().catch(() => {})
    audioContext = null
  }
  if (wsConn) {
    wsConn.onclose = null  // prevent onclose firing callbacks during teardown
    if (wsConn.readyState === WebSocket.OPEN || wsConn.readyState === WebSocket.CONNECTING) {
      wsConn.close(1000, 'Pipeline stopped')
    }
    wsConn = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startAudioPipeline(
  source: AudioSource,
  cbs: AudioPipelineCallbacks
): Promise<void> {
  teardown()
  callbacks     = cbs
  currentSource = source
  isRunning     = true

  dbg('startAudioPipeline — source:', source)

  const token = localStorage.getItem('token')
  if (!token) {
    isRunning = false
    cbs.onError('Not authenticated')
    cbs.onStateChange('error')
    return
  }

  try {
    mediaStream = source === 'system'
      ? await getSystemAudioStream()
      : await getMicStream()

    // Open WebSocket first so it's ready when PCM starts flowing
    wsConn = openWebSocket(token)

    // Wait for WS to open (max 5s)
    await new Promise<void>((resolve, reject) => {
      if (wsConn!.readyState === WebSocket.OPEN) { resolve(); return }
      const t = setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000)
      wsConn!.addEventListener('open',  () => { clearTimeout(t); resolve() }, { once: true })
      wsConn!.addEventListener('error', () => { clearTimeout(t); reject(new Error('WebSocket failed to connect')) }, { once: true })
    })

    await setupAudioCapture(mediaStream)
    wsReconnects = 0
    cbs.onStateChange('listening')
    dbg('Pipeline fully started ✓')
  } catch (err) {
    dbg('startAudioPipeline error:', err)
    isRunning = false
    teardown()
    cbs.onError((err as Error).message)
    cbs.onStateChange('error')
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

  const cbs   = callbacks
  const token = localStorage.getItem('token')
  if (!token) { cbs.onError('Not authenticated'); return }

  teardown()
  isRunning     = true
  currentSource = newSource

  try {
    mediaStream = newSource === 'system'
      ? await getSystemAudioStream()
      : await getMicStream()

    wsConn = openWebSocket(token)
    await new Promise<void>((resolve, reject) => {
      if (wsConn!.readyState === WebSocket.OPEN) { resolve(); return }
      const t = setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000)
      wsConn!.addEventListener('open',  () => { clearTimeout(t); resolve() }, { once: true })
      wsConn!.addEventListener('error', () => { clearTimeout(t); reject(new Error('WebSocket failed to connect')) }, { once: true })
    })

    await setupAudioCapture(mediaStream)
    dbg('switchAudioSource complete ✓')
  } catch (err) {
    dbg('switchAudioSource error:', err)
    isRunning = false
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
