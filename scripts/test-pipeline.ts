/**
 * Audio Pipeline End-to-End Timing Test
 *
 * Stages timed:
 *   T0  — test start
 *   T1  — server health check
 *   T2  — WebSocket connect → open
 *   T3  — Deepgram WS open (server-side proxy open)
 *   T4  — first InterimTranscript received (real speech PCM)
 *   T5  — FinalTranscript (is_final=true) + SpeechFinal received
 *   T6  — /interview/ask POST → answer (Gemini latency)
 *   T7  — /interview/end cleanup
 *
 * Audio: uses macOS `say` → afconvert → 16kHz Int16 RAW PCM
 * streamed at real-time rate (256-sample chunks every 16ms).
 */

import { config } from 'dotenv'
import WebSocket from 'ws'
import { execSync, spawnSync } from 'child_process'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import path from 'path'
import os from 'os'

config()

const SERVER    = 'http://localhost:3847'
const WS_SERVER = 'ws://localhost:3847'

// ── Timing helpers ────────────────────────────────────────────────────────────

const T0 = Date.now()
const timings: Array<{ label: string; ms: number; delta: number }> = []
let lastMs = T0

function mark(label: string): number {
  const now = Date.now()
  const delta = now - lastMs
  timings.push({ label, ms: now - T0, delta })
  lastMs = now
  return delta
}

function ms(n: number): string { return `${n}ms` }

// ── Console helpers ───────────────────────────────────────────────────────────

function ok(label: string, timing?: number): void {
  const t = timing !== undefined ? `  [${ms(timing)}]` : ''
  console.log(`  ✅ ${label}${t}`)
}

function info(label: string): void {
  console.log(`  ℹ️  ${label}`)
}

function fail(label: string, detail?: string): void {
  console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`)
}

async function httpReq<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ status: number; body: T; ms: number }> {
  const t = Date.now()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${SERVER}${path}`, { ...options, headers })
  let body: T
  try { body = await res.json() as T } catch { body = null as unknown as T }
  return { status: res.status, body, ms: Date.now() - t }
}

// ── Speech audio generation ───────────────────────────────────────────────────
// Uses macOS `say` + `afconvert` to get real 16kHz Int16 PCM speech

const SPEECH_TEXT = 'Tell me about yourself and your experience as a software engineer.'
const TMP_DIR     = os.tmpdir()
const AIFF_FILE   = path.join(TMP_DIR, 'pipeline_test.aiff')
const WAV_FILE    = path.join(TMP_DIR, 'pipeline_test.wav')

function generateSpeechPCM(): Buffer {
  // Generate AIFF via macOS TTS
  spawnSync('say', ['-o', AIFF_FILE, SPEECH_TEXT], { stdio: 'ignore' })
  if (!existsSync(AIFF_FILE)) throw new Error('`say` command failed — are you on macOS?')

  // Convert to 16kHz mono Int16 WAV
  spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', AIFF_FILE, WAV_FILE], { stdio: 'ignore' })
  if (!existsSync(WAV_FILE)) throw new Error('`afconvert` failed')

  // Strip 44-byte WAV header → raw Int16 PCM
  const wav = readFileSync(WAV_FILE)
  const pcm = wav.subarray(44)
  return Buffer.from(pcm)
}

// Also create a 0.5s silence trailer to let Deepgram finalise the utterance
function silencePCM(seconds: number): Buffer {
  return Buffer.alloc(Math.round(16000 * seconds * 2), 0)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  let token       = process.env.TEST_JWT || ''
  let passed      = 0
  let total       = 0

  function assert(cond: boolean, label: string, detail?: string): void {
    total++
    if (cond) { passed++ } else fail(label, detail)
  }

  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║     AUDIO PIPELINE — End-to-End Timing Test          ║')
  console.log('╚══════════════════════════════════════════════════════╝\n')
  console.log(`  Speech text: "${SPEECH_TEXT}"\n`)

  // ── Stage 1: Server reachable ────────────────────────────────────────────
  console.log('─── Stage 1: Server health ───')
  try {
    const r = await httpReq('/auth/send-otp', { method: 'POST', body: '{}' })
    const t = mark('Server health check')
    assert(r.status > 0, 'Server reachable')
    ok(`Server reachable at ${SERVER}`, t)
  } catch (e) {
    fail('Server reachable', (e as Error).message)
    console.error('\n  Server not running! Run: npm run dev\n')
    process.exit(1)
  }

  // ── Stage 2: Auth ────────────────────────────────────────────────────────
  console.log('\n─── Stage 2: Authentication ───')
  if (!token) {
    fail('JWT token', 'Set TEST_JWT=<token> in .env to enable full pipeline test')
  } else {
    ok(`JWT loaded (${token.length} chars)`)
  }

  if (!token) {
    printTimings(); printSummary(passed, total); return
  }

  // ── Stage 3: Interview start ─────────────────────────────────────────────
  console.log('\n─── Stage 3: /interview/start (Gemini session) ───')
  const t3 = Date.now()
  const startRes = await httpReq<{ message: string; active: boolean }>(
    '/interview/start', { method: 'POST', body: '{}' }, token
  )
  const t3ms = mark('Interview start')
  assert(startRes.status === 200, '/interview/start 200', `status=${startRes.status} body=${JSON.stringify(startRes.body)}`)
  if (startRes.status === 200) {
    assert(startRes.body?.active === true, 'Session active')
    ok(`Gemini session initialised`, startRes.ms)
  } else {
    info(`Status ${startRes.status} — DB user may not exist for this test JWT (expected for fake test token)`)
  }

  // ── Stage 4+5: WebSocket + Deepgram + real speech ────────────────────────
  console.log('\n─── Stage 4+5: WebSocket → Deepgram Nova-3 → Transcript ───')

  let speechPCM: Buffer
  try {
    speechPCM = generateSpeechPCM()
    ok(`Generated speech PCM: ${speechPCM.byteLength} bytes (~${(speechPCM.byteLength / 32000).toFixed(1)}s at 16kHz)`)
  } catch (e) {
    fail('Generate speech audio', (e as Error).message)
    speechPCM = silencePCM(2)
    info('Falling back to silence (no real transcript expected)')
  }

  const result = await new Promise<{
    wsConnectMs:      number
    dgOpenMs:         number
    firstInterimMs:   number | null
    finalTranscriptMs: number | null
    speechFinalMs:    number | null
    transcript:       string
    interimCount:     number
  }>((resolve) => {
    const wsUrl = `${WS_SERVER}/interview/stream?token=${encodeURIComponent(token)}`
    info(`Connecting → ${WS_SERVER}/interview/stream`)

    const wsStart  = Date.now()
    let wsOpen     = 0
    let pcmSentAt  = 0
    let lastChunkAt = 0

    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    let firstInterimMs:    number | null = null
    let finalTranscriptMs: number | null = null
    let speechFinalMs:     number | null = null
    let transcript         = ''
    let interimCount       = 0

    // Hard timeout: 20s
    const globalTimer = setTimeout(() => {
      ws.close()
      resolve({
        wsConnectMs: wsOpen,
        dgOpenMs: 0,
        firstInterimMs,
        finalTranscriptMs,
        speechFinalMs,
        transcript,
        interimCount
      })
    }, 20000)

    ws.once('open', () => {
      wsOpen = Date.now() - wsStart
      ok(`WebSocket opened`, wsOpen)

      // Stream speech PCM at real-time rate (256-sample = 16ms chunks)
      const CHUNK = 512  // 256 Int16 samples = 16ms at 16kHz
      let offset   = 0
      pcmSentAt    = Date.now()

      const pump = (): void => {
        if (ws.readyState !== WebSocket.OPEN) return
        if (offset >= speechPCM.length) {
          // Append 0.5s silence so Deepgram fires utterance boundary
          ws.send(silencePCM(0.5))
          lastChunkAt = Date.now()
          ok(`All speech PCM sent (${speechPCM.length} bytes over ~${Date.now() - pcmSentAt}ms)`)
          return
        }
        const chunk = speechPCM.subarray(offset, offset + CHUNK)
        ws.send(chunk)
        offset += CHUNK
        setTimeout(pump, 16)  // ~real-time 16ms cadence
      }
      pump()
    })

    ws.on('message', (raw) => {
      const now = Date.now()
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string
          text?: string
          isFinal?: boolean
          speechFinal?: boolean
        }

        if (msg.type !== 'transcript') return
        if (!msg.text?.trim()) return

        const elapsed = now - pcmSentAt
        interimCount++

        if (!firstInterimMs) {
          firstInterimMs = elapsed
          ok(`First interim transcript received  (+${ms(elapsed)} after PCM start)`)
          console.log(`       text: "${msg.text.slice(0, 70)}"`)
        }

        if (msg.isFinal && !finalTranscriptMs) {
          finalTranscriptMs = elapsed
          transcript = msg.text
          ok(`is_final transcript received        (+${ms(elapsed)} after PCM start)`)
          console.log(`       text: "${msg.text.slice(0, 70)}"`)
        }

        if (msg.speechFinal && !speechFinalMs) {
          speechFinalMs = elapsed
          transcript = msg.text
          ok(`speech_final (utterance boundary)   (+${ms(elapsed)} after PCM start)`)
          console.log(`       text: "${msg.text.slice(0, 70)}"`)
          clearTimeout(globalTimer)
          setTimeout(() => { ws.close(); }, 200)
        }
      } catch { /* ignore parse errors */ }
    })

    ws.on('close', () => {
      mark('Deepgram WebSocket stage')
      resolve({
        wsConnectMs:      wsOpen,
        dgOpenMs:         wsOpen,   // server connects Deepgram synchronously inside open
        firstInterimMs,
        finalTranscriptMs,
        speechFinalMs,
        transcript,
        interimCount
      })
    })

    ws.on('error', (err) => {
      fail('WebSocket error', err.message)
      clearTimeout(globalTimer)
      resolve({
        wsConnectMs: 0, dgOpenMs: 0,
        firstInterimMs: null, finalTranscriptMs: null, speechFinalMs: null,
        transcript: '', interimCount: 0
      })
    })
  })

  total++
  if (result.firstInterimMs !== null) {
    passed++
    ok(`Deepgram returned ${result.interimCount} transcript events`)
  } else {
    fail('No transcript received from Deepgram within timeout')
  }
  total++
  if (result.speechFinalMs !== null) {
    passed++
  } else {
    fail('speech_final never fired')
  }

  // ── Stage 6: /interview/ask ──────────────────────────────────────────────
  console.log('\n─── Stage 6: /interview/ask → Gemini answer ───')
  const questionText = result.transcript || 'Tell me about yourself.'
  info(`Sending question: "${questionText.slice(0, 60)}..."`)

  const askStart = Date.now()
  const askRes   = await httpReq<{ question: string; answer: string }>(
    '/interview/ask',
    { method: 'POST', body: JSON.stringify({ text: questionText }) },
    token
  )
  const askMs = mark('Gemini answer')

  assert(askRes.status === 200, '/interview/ask returned 200', `status=${askRes.status}`)
  if (askRes.status === 200) {
    assert(typeof askRes.body?.answer === 'string' && askRes.body.answer.length > 5, 'Answer received')
    ok(`Gemini answered in ${ms(askRes.ms)}`)
    console.log(`       answer: "${(askRes.body?.answer || '').slice(0, 80)}${(askRes.body?.answer?.length || 0) > 80 ? '...' : ''}"`)
  } else {
    info(`Status ${askRes.status} — no active Gemini session (expected for fake test JWT)`)
  }

  // ── Stage 7: Cleanup ─────────────────────────────────────────────────────
  console.log('\n─── Stage 7: /interview/end ───')
  const endRes = await httpReq<{ message: string }>('/interview/end', { method: 'POST', body: '{}' }, token)
  assert(endRes.status === 200, 'Session ended', `status=${endRes.status}`)
  ok(`Session ended`, endRes.ms)

  // ── Timing summary ───────────────────────────────────────────────────────
  const speechDurationMs = Math.round((speechPCM.byteLength / 32000) * 1000)
  const totalE2E = (result.speechFinalMs ?? 0) + (askRes.ms ?? 0) + 500 // 500ms debounce in app

  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║                TIMING BREAKDOWN                      ║')
  console.log('╠══════════════════════════════════════════════════════╣')
  console.log(`║  Speech audio duration (test clip)   : ${speechDurationMs}ms`)
  console.log('╠──────────────────────────────────────────────────────╣')
  console.log(`║  Stage A: WebSocket connect           : ${ms(result.wsConnectMs)}`)
  if (result.firstInterimMs !== null) {
    console.log(`║  Stage B: First interim from Deepgram : +${ms(result.firstInterimMs)} from PCM start`)
  }
  if (result.finalTranscriptMs !== null) {
    const afterSpeech = result.finalTranscriptMs - speechDurationMs
    console.log(`║  Stage C: is_final transcript         : +${ms(result.finalTranscriptMs)} from PCM start`)
    console.log(`║           (= +${ms(afterSpeech)} after speaking stopped)`)
  }
  if (result.speechFinalMs !== null) {
    const afterSpeech = result.speechFinalMs - speechDurationMs
    console.log(`║  Stage D: speech_final (DG boundary)  : +${ms(result.speechFinalMs)} from PCM start`)
    console.log(`║           (= +${ms(afterSpeech)} after speaking stopped)`)
  }
  if (askRes.status === 200) {
    console.log(`║  Stage E: Gemini answer latency       : ${ms(askRes.ms)}`)
  }
  console.log('╠──────────────────────────────────────────────────────╣')
  if (result.speechFinalMs !== null && askRes.status === 200) {
    const afterSpeechFinal = result.speechFinalMs - speechDurationMs
    console.log(`║  ⏱  TOTAL utterance → answer*         : ~${ms(afterSpeechFinal + 500 + askRes.ms)}`)
    console.log('║     (* speech_final delay + 500ms app debounce + Gemini)')
  } else {
    console.log(`║  ⏱  TOTAL (partial — no Gemini session): ~${ms((result.speechFinalMs ?? 0))}`)
  }
  console.log('╚══════════════════════════════════════════════════════╝')

  printSummary(passed, total)
}

function printSummary(passed: number, total: number): void {
  const failed = total - passed
  console.log(`\n  RESULTS: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ' — all OK'}\n`)
  if (failed > 0) process.exit(1)
}

run().catch((err) => {
  console.error('\nUnhandled error:', err)
  process.exit(1)
})
