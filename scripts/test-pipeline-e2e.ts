/**
 * End-to-end pipeline diagnostic test.
 * Tests every stage independently and reports timing for each.
 *
 * Stages:
 *   STAGE 1 — Gemini API reachability
 *   STAGE 2 — Code analysis model init (session creation)
 *   STAGE 3 — analyzeScreenContent() with a synthetic code screenshot (base64 JPEG)
 *   STAGE 4 — HTTP round-trip via /interview/code-suggest (requires running server + valid JWT)
 *   STAGE 5 — Change detection logic (pixel diff — pure JS, no browser needed)
 *
 * Usage:
 *   npx tsx scripts/test-pipeline-e2e.ts
 *   npx tsx scripts/test-pipeline-e2e.ts --token <jwt>   # also tests HTTP stage
 */
import 'dotenv/config'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createCanvas } from 'canvas'
import fetch from 'node-fetch'

const TOKEN = process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : null
const SERVER = 'http://localhost:3847'

function sep(label: string) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${label}`)
  console.log('─'.repeat(60))
}

function ok(msg: string) { console.log(`  ✅  ${msg}`) }
function fail(msg: string) { console.log(`  ❌  ${msg}`) }
function info(msg: string) { console.log(`  ℹ️   ${msg}`) }
function time(label: string, ms: number) {
  const color = ms < 2000 ? '32' : ms < 5000 ? '33' : '31'
  console.log(`  ⏱   ${label}: \x1b[${color}m${ms}ms\x1b[0m`)
}

// ─────────────────────────────────────────────────────────────
// Synthetic code image — renders a LeetCode-style problem on canvas
// ─────────────────────────────────────────────────────────────
function buildCodeImage(width = 1280, height = 720): string {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // White background
  ctx.fillStyle = '#1e1e1e'
  ctx.fillRect(0, 0, width, height)

  // Simulate LeetCode problem + python editor
  ctx.fillStyle = '#d4d4d4'
  ctx.font = '20px monospace'
  const lines = [
    '// LeetCode 1 — Two Sum',
    '//',
    '// Given an array of integers nums and an integer target,',
    '// return indices of the two numbers that add up to target.',
    '//',
    '// Example: nums = [2,7,11,15], target = 9 → [0,1]',
    '',
    'class Solution {',
    '    public int[] twoSum(int[] nums, int target) {',
    '        // your code here',
    '    }',
    '}',
  ]
  lines.forEach((line, i) => {
    ctx.fillText(line, 40, 60 + i * 36)
  })

  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

// ─────────────────────────────────────────────────────────────
// STAGE 5 — Pixel diff logic (pure JS, mirrors screenCapture.ts)
// ─────────────────────────────────────────────────────────────
function testPixelDiff() {
  sep('STAGE 5 — Pixel diff change detection logic')

  const W = 128, H = 72, TOLERANCE = 10, THRESHOLD = 0.001

  function diff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
    let changed = 0
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) > TOLERANCE ||
          Math.abs(a[i+1] - b[i+1]) > TOLERANCE ||
          Math.abs(a[i+2] - b[i+2]) > TOLERANCE) changed++
    }
    return changed / (W * H)
  }

  // Test 1: identical frames → should be dropped
  const frame1 = new Uint8ClampedArray(W * H * 4).fill(128)
  const frame2 = new Uint8ClampedArray(W * H * 4).fill(128)
  const r1 = diff(frame1, frame2)
  if (r1 < THRESHOLD) ok(`Identical frames → dropped (${(r1*100).toFixed(3)}% diff < ${THRESHOLD*100}%)`)
  else fail(`Identical frames should be dropped but got ${(r1*100).toFixed(3)}% diff`)

  // Test 2: noise (±5 per channel) → should be dropped (within tolerance)
  const frame3 = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < frame3.length; i+=4) {
    frame3[i] = 128 + (Math.random() * 10 - 5)    // ±5 noise
    frame3[i+1] = 128 + (Math.random() * 10 - 5)
    frame3[i+2] = 128 + (Math.random() * 10 - 5)
    frame3[i+3] = 255
  }
  const r2 = diff(frame1, frame3)
  if (r2 < THRESHOLD) ok(`JPEG noise (±5) → dropped (${(r2*100).toFixed(3)}% diff)`)
  else info(`JPEG noise (±5) → sent (${(r2*100).toFixed(3)}% diff) — acceptable`)

  // Test 3: one character typed (2% of pixels changed significantly)
  const frame4 = new Uint8ClampedArray(frame1)
  const changedCount = Math.floor(W * H * 0.02) // 2% of pixels
  for (let i = 0; i < changedCount; i++) {
    const px = i * 4
    frame4[px] = 255; frame4[px+1] = 255; frame4[px+2] = 255  // white pixels (text)
  }
  const r3 = diff(frame1, frame4)
  if (r3 >= THRESHOLD) ok(`Single char typed (2% diff) → sent (${(r3*100).toFixed(2)}% diff ≥ ${THRESHOLD*100}%)`)
  else fail(`Single char typed should trigger send but got ${(r3*100).toFixed(3)}%`)

  // Test 4: tiny change (0.05% — cursor blink)
  const frame5 = new Uint8ClampedArray(frame1)
  const tinyCount = Math.floor(W * H * 0.0005) // 0.05%
  for (let i = 0; i < tinyCount; i++) {
    const px = i * 4; frame5[px] = 255
  }
  const r4 = diff(frame1, frame5)
  if (r4 < THRESHOLD) ok(`Cursor blink (0.05% diff) → dropped (${(r4*100).toFixed(3)}%)`)
  else info(`Cursor blink (0.05%) → sent (${(r4*100).toFixed(3)}%) — threshold may need tuning`)

  time('Pixel diff loop over 128×72 frame', (() => {
    const t = Date.now(); diff(frame1, frame4); return Date.now() - t
  })())
}

// ─────────────────────────────────────────────────────────────
// STAGE 1 — Gemini API reachability
// ─────────────────────────────────────────────────────────────
async function testGeminiReachability() {
  sep('STAGE 1 — Gemini API reachability')
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) { fail('GEMINI_API_KEY not set'); return false }
  ok(`API key found (${apiKey.slice(0, 8)}...)`)

  const t0 = Date.now()
  try {
    const ai = new GoogleGenerativeAI(apiKey)
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent('Say "OK" and nothing else.')
    const text = result.response.text().trim()
    time('Gemini ping (text-only)', Date.now() - t0)
    if (text.toLowerCase().includes('ok')) ok(`Response: "${text}"`)
    else info(`Response: "${text}"`)
    return true
  } catch (err: any) {
    time('Gemini ping (failed)', Date.now() - t0)
    fail(`API error: ${err.message}`)
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// STAGE 2 — Model session init
// ─────────────────────────────────────────────────────────────
async function testSessionInit() {
  sep('STAGE 2 — Code analysis session init')
  const apiKey = process.env.GEMINI_API_KEY!
  const ai = new GoogleGenerativeAI(apiKey)
  const t0 = Date.now()
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: 'You analyze screenshots during a live technical interview. Return ONLY JSON: {"detected": boolean, "language": string, "suggestion": string}',
    generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } } as any
  })
  time('Model instance created (local, no API call)', Date.now() - t0)
  ok('Model instance ready')
  return model
}

// ─────────────────────────────────────────────────────────────
// STAGE 3 — analyzeScreenContent() with synthetic image
// ─────────────────────────────────────────────────────────────
async function testCodeAnalysis(model: any) {
  sep('STAGE 3 — Code analysis with synthetic code screenshot')

  info('Building synthetic 1280×720 code screenshot (LeetCode Two Sum problem)...')
  const t0 = Date.now()
  const base64 = buildCodeImage()
  time('Canvas render', Date.now() - t0)
  info(`Image size: ${Math.round(base64.length / 1024)}KB base64`)

  info('Sending to Gemini...')
  const t1 = Date.now()
  try {
    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/jpeg', data: base64 } },
      { text: 'Analyze this screenshot. Return only the JSON as specified.' }
    ])
    const elapsed = Date.now() - t1
    time('Gemini generateContent() (image)', elapsed)

    let raw = result.response.text().trim()
    info(`Raw response (first 400 chars): ${raw.slice(0, 400)}`)

    // Strip fences
    if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    if (!raw.startsWith('{')) { const m = raw.match(/\{[\s\S]*\}/); if (m) raw = m[0] }

    const parsed = JSON.parse(raw)
    if (parsed.detected) {
      ok(`detected: ${parsed.detected} | language: ${parsed.language}`)
      ok(`suggestion length: ${parsed.suggestion?.length ?? 0} chars`)
      info(`suggestion preview: ${parsed.suggestion?.slice(0, 200)}`)
    } else {
      fail(`detected: false — model did not see code in the synthetic screenshot`)
      info('This means the canvas rendering or image quality may need checking')
    }
    return elapsed
  } catch (err: any) {
    time('Gemini (failed)', Date.now() - t1)
    fail(`Error: ${err.message}`)
    return -1
  }
}

// ─────────────────────────────────────────────────────────────
// STAGE 4 — HTTP round-trip via /interview/code-suggest
// ─────────────────────────────────────────────────────────────
async function testHttpRoundTrip() {
  sep('STAGE 4 — HTTP round-trip via /interview/code-suggest')

  if (!TOKEN) {
    info('No --token provided, skipping HTTP stage')
    info('To test: npx tsx scripts/test-pipeline-e2e.ts --token <your-jwt>')
    return
  }

  const base64 = buildCodeImage()
  info(`Sending ${Math.round(base64.length / 1024)}KB image to ${SERVER}/interview/code-suggest`)

  const t0 = Date.now()
  try {
    const res = await fetch(`${SERVER}/interview/code-suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ image: base64 })
    })
    const elapsed = Date.now() - t0
    time('HTTP POST round-trip', elapsed)

    if (!res.ok) {
      fail(`HTTP ${res.status}: ${await res.text()}`)
      return
    }

    const body = await res.json() as any
    info(`Response: ${JSON.stringify(body).slice(0, 300)}`)
    if (body.detected) ok(`detected: ${body.detected} | language: ${body.language}`)
    else info('detected: false (model did not see code, or screen not showing code)')
  } catch (err: any) {
    time('HTTP (failed)', Date.now() - t0)
    fail(`Error: ${err.message}`)
  }
}

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔬  Screen Suggestion Pipeline — End-to-End Diagnostic')
  console.log('   Date:', new Date().toLocaleString())

  testPixelDiff()

  const apiOk = await testGeminiReachability()
  if (!apiOk) {
    fail('Aborting — cannot reach Gemini API')
    process.exit(1)
  }

  const model = await testSessionInit()
  const geminiMs = await testCodeAnalysis(model)
  await testHttpRoundTrip()

  sep('SUMMARY')
  if (geminiMs > 0) {
    info(`Pixel diff check:           < 1ms`)
    info(`Canvas frame build:         ~5ms`)
    info(`Gemini API (image, 1280×720): ${geminiMs}ms`)
    info(`Total pipeline (capture→suggestion): ~${geminiMs + 10}ms`)
    info('')
    if (geminiMs < 3000) ok('Pipeline is FAST (< 3s)')
    else if (geminiMs < 6000) info('Pipeline is ACCEPTABLE (3–6s)')
    else fail('Pipeline is SLOW (> 6s) — consider model or image size optimisation')
  }
  console.log()
}

main().catch(console.error)
