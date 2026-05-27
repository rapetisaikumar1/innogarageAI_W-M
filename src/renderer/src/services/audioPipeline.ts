import { useAuthStore } from '../store/authStore'
import { WS_BASE_URL } from './config'

import workletUrl from './pcmProcessorWorklet?worker&url'

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

const WS_URL = WS_BASE_URL
const DEBUG    = import.meta.env.DEV
const TARGET_SAMPLE_RATE = 16000  // Deepgram linear16 expects 16kHz
const MAX_WS_RECONNECT_DELAY_MS = 10_000

type AudioSource = 'mic' | 'system'

interface AudioPipelineCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void
  onError: (error: string) => void
  onStateChange: (state: 'idle' | 'listening' | 'error') => void
}

// ── Module state ──────────────────────────────────────────────────────────────

let mediaStream:     MediaStream | null         = null
let audioContext:    AudioContext | null        = null
let processor:       AudioWorkletNode | null    = null
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
  const url = `${WS_URL}/interview/stream`
  dbg('Opening WebSocket:', url)
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    wsReconnects = 0
    dbg('WebSocket open ✓')
    ws.send(JSON.stringify({ type: 'auth', token }))
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as {
        type: string
        ok?: boolean
        text?: string
        isFinal?: boolean
        speechFinal?: boolean
        message?: string
      }

      if (msg.type === 'auth') {
        dbg('WebSocket authenticated ✓')
        return
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
    // 1000=normal, 4001=auth rejected, 4002=server config error, 4003=upstream failure — don't reconnect
    const fatalCodes = new Set([1000, 4001, 4002, 4003])
    if (isRunning && !fatalCodes.has(e.code)) {
      // Transient disconnect — try to reconnect
      wsReconnects++
      const delay = Math.min(wsReconnects * 1000, MAX_WS_RECONNECT_DELAY_MS)
      dbg(`Attempting WS reconnect #${wsReconnects} in ${delay}ms`)
      setTimeout(() => {
        if (!isRunning) return
        try {
          wsConn = openWebSocket(token)
        } catch {
          callbacks?.onError('Failed to reconnect audio stream')
        }
      }, delay)
    }
  }

  return ws
}

async function waitForWebSocketAuth(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('WebSocket authentication timeout'))
    }, 5000)

    const cleanup = (): void => {
      clearTimeout(timer)
      ws.removeEventListener('message', handleMessage)
      ws.removeEventListener('error', handleError)
      ws.removeEventListener('close', handleClose)
    }

    const handleMessage = (event: MessageEvent): void => {
      let msg: { type?: string; ok?: boolean; error?: string }
      try {
        msg = JSON.parse(event.data as string) as { type?: string; ok?: boolean; error?: string }
      } catch {
        return
      }

      if (msg.type !== 'auth') return
      cleanup()
      if (msg.ok) {
        resolve()
        return
      }
      reject(new Error(msg.error || 'WebSocket authentication failed'))
    }

    const handleError = (): void => {
      cleanup()
      reject(new Error('WebSocket failed to connect'))
    }

    const handleClose = (e: CloseEvent): void => {
      cleanup()
      const reason = e.reason ? ` — ${e.reason}` : ''
      reject(new Error(`WebSocket closed during authentication (code: ${e.code}${reason})`))
    }

    ws.addEventListener('message', handleMessage)
    ws.addEventListener('error', handleError)
    ws.addEventListener('close', handleClose)
  })
}

// ── Stream helpers ────────────────────────────────────────────────────────────

async function getMicStream(): Promise<MediaStream> {
  dbg('─── GET MIC STREAM ───')
  // NOTE: Do NOT request sampleRate or channelCount as hard constraints —
  // Windows audio drivers only support 44100Hz/48000Hz and will throw
  // OverconstrainedError. The AudioContext resamples to 16kHz regardless.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
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

async function setupAudioCapture(stream: MediaStream): Promise<void> {
  dbg('─── SETUP AUDIO CONTEXT ───')
  audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  dbg(`  created — state: ${audioContext.state}, sampleRate: ${audioContext.sampleRate}Hz`)

  if (audioContext.state === 'suspended') {
    await audioContext.resume()
    dbg(`  resumed — state: ${audioContext.state}`)
  }

  const source = audioContext.createMediaStreamSource(stream)

  await audioContext.audioWorklet.addModule(workletUrl)

  processor = new AudioWorkletNode(audioContext, 'pcm-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    outputChannelCount: [1]
  })
  processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (!isRunning || wsConn?.readyState !== WebSocket.OPEN) return
    const float32 = event.data
    const int16 = float32ToInt16(float32)
    wsConn.send(int16.buffer)
  }

  // Route to a MediaStreamDestinationNode (not audioContext.destination) to keep
  // the audio graph alive so onaudioprocess fires, but never route audio to speakers.
  // Routing to audioContext.destination (even via gain=0) can create an internal
  // loopback in Electron/Chrome, causing system output to bleed into mic captures.
  const streamDest = audioContext.createMediaStreamDestination()

  source.connect(processor)
  processor.connect(streamDest)
  dbg('  ✓ AudioWorklet connected via MediaStreamDestination — streaming PCM to WebSocket')
}

// ── Teardown ──────────────────────────────────────────────────────────────────

function teardown(): void {
  dbg('Teardown called')

  if (processor) {
    processor.disconnect()
    processor.port.onmessage = null
    processor = null
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

  const token = useAuthStore.getState().token
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
    await waitForWebSocketAuth(wsConn)

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
  const token = useAuthStore.getState().token
  if (!token) { cbs.onError('Not authenticated'); return }

  teardown()
  isRunning     = true
  currentSource = newSource

  try {
    mediaStream = newSource === 'system'
      ? await getSystemAudioStream()
      : await getMicStream()

    wsConn = openWebSocket(token)
    await waitForWebSocketAuth(wsConn)

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
