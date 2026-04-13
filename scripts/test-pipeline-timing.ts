/**
 * Pipeline Timing Test — measures each stage independently
 * Stage 1: Server reachability
 * Stage 2: Deepgram WebSocket connect + real speech transcription
 * Stage 3: Gemini API key validity + answer latency (direct SDK call)
 */

import { config } from 'dotenv'
config()

import { GoogleGenerativeAI } from '@google/generative-ai'
import WebSocket from 'ws'
import { spawnSync, execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import os from 'os'

const SERVER    = 'http://localhost:3847'
const WS_SERVER = 'ws://localhost:3847'
const T0 = Date.now()

function elapsed(): string { return `${Date.now() - T0}ms` }
function since(t: number): number { return Date.now() - t }
function ms(n: number): string { return `${n}ms` }

function ok(label: string, t?: number)  { console.log(`  ✅ ${label}${t !== undefined ? `  [${ms(t)}]` : ''}`) }
function fail(label: string, d?: string){ console.log(`  ❌ ${label}${d ? ': ' + d : ''}`) }
function info(label: string)            { console.log(`  ℹ️  ${label}`) }
function sep(title: string)             { console.log(`\n─── ${title} ───`) }

// ── Speech PCM generator (macOS say + afconvert) ─────────────────────────────

const SPEECH = 'Tell me about yourself and your experience as a software engineer.'
const TMP    = os.tmpdir()
const AIFF   = path.join(TMP, 'pt_speech.aiff')
const WAV    = path.join(TMP, 'pt_speech.wav')

function generatePCM(): Buffer {
  spawnSync('say', ['-o', AIFF, SPEECH], { stdio: 'ignore' })
  if (!existsSync(AIFF)) throw new Error('`say` failed')
  spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', AIFF, WAV], { stdio: 'ignore' })
  if (!existsSync(WAV)) throw new Error('`afconvert` failed')
  const wav = readFileSync(WAV)
  return Buffer.from(wav.subarray(44))       // strip 44-byte header → raw Int16 PCM
}

function silence(secs: number): Buffer {
  return Buffer.alloc(Math.round(16000 * secs * 2), 0)
}

// ── Deepgram WS test ─────────────────────────────────────────────────────────

interface DGResult {
  wsOpenMs: number
  firstInterimMs: number | null   // ms from first PCM byte
  utteranceEndMs: number | null   // ms from first PCM byte (UtteranceEnd fires = 1200ms silence)
  transcript: string
  interimEvents: number
}

async function testDeepgram(dgApiKey: string, pcm: Buffer): Promise<DGResult> {
  return new Promise((resolve) => {
    const url     = `wss://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true&interim_results=true&utterance_end_ms=1200&endpointing=300&encoding=linear16&sample_rate=16000&channels=1`
    const wsStart = Date.now()

    const ws = new WebSocket(url, { headers: { Authorization: `Token ${dgApiKey}` } })
    ws.binaryType = 'arraybuffer'

    let wsOpenMs        = 0
    let pcmStartAt      = 0
    let firstInterimMs: number | null = null
    let utteranceEndMs: number | null = null
    let transcript      = ''
    let interimEvents   = 0
    let utteranceBuf    = ''

    const timeout = setTimeout(() => { ws.close() }, 25000)

    ws.on('open', () => {
      wsOpenMs   = since(wsStart)
      pcmStartAt = Date.now()
      ok(`  Deepgram WS open`, wsOpenMs)

      // Stream PCM at real-time rate (512-byte = 16ms at 16kHz Int16)
      const CHUNK = 512
      let offset  = 0
      const pump  = (): void => {
        if (ws.readyState !== WebSocket.OPEN) return
        if (offset >= pcm.length) {
          // send 1.5s silence so Deepgram fires UtteranceEnd at 1200ms
          ws.send(silence(1.5))
          return
        }
        ws.send(pcm.subarray(offset, offset + CHUNK))
        offset += CHUNK
        setTimeout(pump, 16)
      }
      pump()
    })

    ws.on('message', (raw) => {
      const now = Date.now()
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string
          channel?: { alternatives?: Array<{ transcript?: string }> }
          is_final?: boolean
          speech_final?: boolean
        }

        if (msg.type === 'Results') {
          const text = msg.channel?.alternatives?.[0]?.transcript ?? ''
          if (!text) return

          interimEvents++

          if (firstInterimMs === null) {
            firstInterimMs = since(pcmStartAt)
            info(`    First interim: "${text.slice(0, 60)}"`)
          }

          if (msg.is_final) {
            utteranceBuf += (utteranceBuf ? ' ' : '') + text
          }

        } else if (msg.type === 'UtteranceEnd') {
          utteranceEndMs = since(pcmStartAt)
          transcript     = utteranceBuf.trim()
          clearTimeout(timeout)
          ws.close()
        }
      } catch { /* ignore */ }
    })

    ws.on('close', () => resolve({ wsOpenMs, firstInterimMs, utteranceEndMs, transcript, interimEvents }))
    ws.on('error', (err) => { fail(`  DG WS error: ${err.message}`); clearTimeout(timeout); resolve({ wsOpenMs: 0, firstInterimMs: null, utteranceEndMs: null, transcript: '', interimEvents: 0 }) })
  })
}

// ── Gemini timing test ───────────────────────────────────────────────────────

interface GeminiResult {
  initMs:   number
  answerMs: number
  answer:   string
  error:    string | null
}

async function testGemini(apiKey: string, question: string): Promise<GeminiResult> {
  const t0   = Date.now()
  const ai   = new GoogleGenerativeAI(apiKey)
  const initMs = since(t0)

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      // @ts-ignore
      thinkingConfig: { thinkingBudget: 0 }
    }
  })

  const chat    = model.startChat({ history: [] })
  const tAsk    = Date.now()

  try {
    const result    = await chat.sendMessage(question)
    const answerMs  = since(tAsk)
    const answer    = result.response.text()
    return { initMs, answerMs, answer, error: null }
  } catch (err) {
    return { initMs, answerMs: since(tAsk), answer: '', error: (err as Error).message }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║     AUDIO PIPELINE — Per-Stage Timing Test           ║')
  console.log('╚══════════════════════════════════════════════════════╝')

  const GEMINI_KEY  = process.env.GEMINI_API_KEY  || ''
  const DG_KEY      = process.env.DEEPGRAM_API_KEY || ''

  if (!GEMINI_KEY)  { fail('GEMINI_API_KEY not set') }
  if (!DG_KEY)      { fail('DEEPGRAM_API_KEY not set') }

  // ── Stage 1: Server health ──────────────────────────────────────────────
  sep('Stage 1: Server reachability')
  try {
    const t = Date.now()
    const r = await fetch(`${SERVER}/auth/send-otp`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
    ok(`Server at ${SERVER}`, since(t))
  } catch (e) {
    fail('Server unreachable', (e as Error).message)
    info('Run `npm run dev` first')
    process.exit(1)
  }

  // ── Stage 2: Generate speech PCM ───────────────────────────────────────
  sep('Stage 2: macOS TTS → Int16 PCM')
  let pcm: Buffer
  try {
    const t = Date.now()
    pcm = generatePCM()
    const durationMs = Math.round(pcm.byteLength / 32000 * 1000)
    ok(`Generated ${pcm.byteLength} bytes = ${durationMs}ms of speech at 16kHz`, since(t))
    info(`Text: "${SPEECH}"`)
  } catch (e) {
    fail('TTS generation failed', (e as Error).message)
    process.exit(1)
  }

  const speechDurationMs = Math.round(pcm.byteLength / 32000 * 1000)

  // ── Stage 3: Deepgram direct (bypasses server proxy for clean timing) ──
  sep('Stage 3: Deepgram Nova-3 — direct WebSocket')
  info('Connecting directly to Deepgram cloud...')
  const dg = await testDeepgram(DG_KEY, pcm)

  if (dg.firstInterimMs !== null)  ok(`First interim transcript`, dg.firstInterimMs)
  else                              fail('No interim results received')

  if (dg.utteranceEndMs !== null) {
    const afterSpeech = dg.utteranceEndMs - speechDurationMs
    ok(`UtteranceEnd fired`, dg.utteranceEndMs)
    info(`= ${ms(afterSpeech)} after speech ended (utterance_end_ms=1200ms)`)
    info(`Transcript: "${dg.transcript.slice(0, 80)}"`)
    info(`Total interim events received: ${dg.interimEvents}`)
  } else {
    fail('UtteranceEnd never fired (timeout)')
  }

  // ── Stage 4: Gemini API ─────────────────────────────────────────────────
  sep('Stage 4: Gemini 2.5 Flash — answer latency')
  const question = dg.transcript || SPEECH
  info(`Question: "${question.slice(0, 70)}"`)
  info('Calling gemini-2.5-flash (thinkingBudget=0)...')

  const gem = await testGemini(GEMINI_KEY, question)

  if (gem.error) {
    fail(`Gemini error: ${gem.error}`)
  } else {
    ok(`Gemini answered`, gem.answerMs)
    info(`Answer preview: "${gem.answer.slice(0, 100)}${gem.answer.length > 100 ? '…' : ''}"`)
  }

  // ── Final summary ───────────────────────────────────────────────────────
  const utteranceDelay  = dg.utteranceEndMs !== null ? (dg.utteranceEndMs - speechDurationMs) : 1200
  const geminiMs        = gem.error ? 0 : gem.answerMs
  const total           = utteranceDelay + geminiMs

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║                  TIMING BREAKDOWN                           ║')
  console.log('╠══════════════════════════════════════════════════════════════╣')
  console.log(`║  Speech clip duration                  : ${ms(speechDurationMs).padEnd(10)}            ║`)
  console.log('╠──────────────────────────────────────────────────────────────╣')
  console.log(`║  Stage A: Deepgram WS open             : ${ms(dg.wsOpenMs).padEnd(10)}            ║`)
  if (dg.firstInterimMs !== null)
    console.log(`║  Stage B: First interim transcript     : +${ms(dg.firstInterimMs).padEnd(9)} from PCM start ║`)
  if (dg.utteranceEndMs !== null) {
    console.log(`║  Stage C: UtteranceEnd fires           : +${ms(dg.utteranceEndMs).padEnd(9)} from PCM start ║`)
    console.log(`║           (silence wait after speech)  : +${ms(utteranceDelay).padEnd(9)} after speech   ║`)
  }
  if (!gem.error) {
    console.log(`║  Stage D: Gemini 2.5-flash answer      : ${ms(geminiMs).padEnd(10)}            ║`)
  }
  console.log('╠══════════════════════════════════════════════════════════════╣')
  if (!gem.error && dg.utteranceEndMs !== null) {
    console.log(`║  ⏱  TOTAL (silence wait + Gemini)        : ~${ms(total).padEnd(8)}            ║`)
    console.log(`║     Breakdown: ${ms(utteranceDelay)} silence + ${ms(geminiMs)} Gemini            `.padEnd(64) + '║')
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n')
}

run().catch((err) => {
  console.error('\nUnhandled error:', err)
  process.exit(1)
})
