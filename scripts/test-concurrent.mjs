/**
 * Concurrent Performance Test — 2 Users
 * Tests Q&A pipeline (SSE) and screen analysis pipeline simultaneously
 */

const BASE = 'https://innogarage-ai-production.up.railway.app';
const T1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNjE0NjI2MC1jMmMxLTRhMjYtYTYzMy03ZTUzZWU2NWZkZDYiLCJlbWFpbCI6InNhaWt1bWFyYXBldGkxQGdtYWlsLmNvbSIsImlhdCI6MTc3NjQ0MjA0NywiZXhwIjoxNzc2NDQ1NjQ3fQ.J3LrBZxBIEg3nAtwbr1-fDPMKrSkGprFC3BdHlbAjTA';
const T2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3MjhkMGY0Ni1kY2IyLTRiMGItYTA1Yi0wMGI0ZDg5NTRiZTEiLCJlbWFpbCI6InJhcGV0aXNhaWt1bWFyOTg2NkBnbWFpbC5jb20iLCJpYXQiOjE3NzY0NDIwNDcsImV4cCI6MTc3NjQ0NTY0N30.UwoNPbHPHeUaFnh4tQJQftnrNRpQ3CgHWthBRMgIFIc';

// ── Helpers ──────────────────────────────────────────

function hdr(text) {
  const w = 64;
  const pad = Math.max(0, Math.floor((w - text.length) / 2));
  console.log('\n' + '='.repeat(w));
  console.log(' '.repeat(pad) + text);
  console.log('='.repeat(w));
}

function row(label, value) {
  console.log(`  ${label.padEnd(28)} ${value}`);
}

async function post(path, token, body) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body)
  });
}

// ── Q&A SSE Test ─────────────────────────────────────

async function testQA(label, token, question) {
  const t0 = Date.now();
  let ttfb = 0, chunks = 0, answer = '';
  try {
    const res = await post('/interview/ask', token, { text: question });
    ttfb = Date.now() - t0;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      chunks++;
      for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try { answer += JSON.parse(payload).text || ''; } catch {}
        }
      }
    }
  } catch (e) {
    return { label, error: e.message };
  }
  const total = Date.now() - t0;
  const tokensPerSec = answer.length > 0 ? Math.round(answer.split(/\s+/).length / (total / 1000)) : 0;
  return { label, ttfb, total, chunks, answerLen: answer.length, tokensPerSec, preview: answer.slice(0, 120) };
}

// ── Screen Analysis Test (synthetic image) ───────────

function makeSyntheticCodeImage() {
  // Create a minimal base64 JPEG-like payload (1x1 white pixel JPEG)
  // For real testing we'd use canvas, but this tests the endpoint round-trip
  const raw = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
    0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
    0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
    0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
    0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
    0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
    0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
    0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
    0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
    0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0xFF,
    0xD9
  ]);
  return raw.toString('base64');
}

async function testScreenAnalysis(label, token) {
  const image = makeSyntheticCodeImage();
  const t0 = Date.now();
  let ttfb = 0;
  try {
    const res = await post('/interview/code-suggest', token, { image });
    ttfb = Date.now() - t0;
    const body = await res.json();
    const total = Date.now() - t0;
    return { label, ttfb, total, status: res.status, detected: body.detected, context: body.context?.slice(0, 80), language: body.language };
  } catch (e) {
    return { label, error: e.message, total: Date.now() - t0 };
  }
}

// ── WebSocket (Deepgram) Connection Test ─────────────

async function testWSConnect(label, token) {
  const { default: WebSocket } = await import('ws');
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ws = new WebSocket(BASE.replace('https', 'wss') + '/interview/stream?token=' + token);
    let openMs = 0;
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ label, error: 'timeout (10s)', total: Date.now() - t0 });
    }, 10000);
    ws.on('open', () => {
      openMs = Date.now() - t0;
      // Send a small silence buffer to trigger Deepgram init
      ws.send(Buffer.alloc(4096, 0));
    });
    ws.on('message', (data) => {
      clearTimeout(timeout);
      const firstMsg = Date.now() - t0;
      let parsed;
      try { parsed = JSON.parse(data.toString()); } catch {}
      ws.close();
      resolve({ label, openMs, firstMsgMs: firstMsg, total: Date.now() - t0, msgType: parsed?.type });
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ label, error: err.message, total: Date.now() - t0 });
    });
    ws.on('close', (code) => {
      clearTimeout(timeout);
      if (!openMs) resolve({ label, error: 'closed with code ' + code, total: Date.now() - t0 });
    });
  });
}

// ── Sequential Q&A (follow-up) Test ──────────────────

async function testSequentialQA(label, token, questions) {
  const results = [];
  for (const q of questions) {
    const r = await testQA(label, token, q);
    results.push(r);
  }
  return results;
}

// ═══════════════════════════════════════════════════════
//  MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('################################################################');
  console.log('#   INNOGARAGE.AI — CONCURRENT PERFORMANCE TEST (2 USERS)     #');
  console.log('#   Server: ' + BASE.padEnd(49) + '#');
  console.log('#   Time:   ' + new Date().toISOString().padEnd(49) + '#');
  console.log('################################################################');

  // ── TEST 1: Session Initialization ──────────────────
  hdr('TEST 1: Session Initialization (/interview/start)');
  console.log('  Starting 2 sessions concurrently...\n');

  const startT0 = Date.now();
  const [s1, s2] = await Promise.all([
    (async () => {
      const t = Date.now();
      const r = await post('/interview/start', T1, {});
      const body = await r.json();
      return { user: 'User1', ms: Date.now() - t, status: r.status, body };
    })(),
    (async () => {
      const t = Date.now();
      const r = await post('/interview/start', T2, {});
      const body = await r.json();
      return { user: 'User2', ms: Date.now() - t, status: r.status, body };
    })()
  ]);
  const startTotal = Date.now() - startT0;

  row('User1 session init:', s1.ms + 'ms (HTTP ' + s1.status + ')');
  row('User2 session init:', s2.ms + 'ms (HTTP ' + s2.status + ')');
  row('Wall-clock (parallel):', startTotal + 'ms');
  row('Overhead vs sequential:', (startTotal - Math.max(s1.ms, s2.ms)) + 'ms');

  // ── TEST 2: Concurrent Q&A SSE Streaming ────────────
  hdr('TEST 2: Q&A Pipeline — Concurrent SSE Streaming');
  console.log('  User1: "What is a closure in JavaScript?"');
  console.log('  User2: "Explain how React virtual DOM works."\n');

  const [qa1, qa2] = await Promise.all([
    testQA('User1', T1, 'What is a closure in JavaScript? Give a brief example.'),
    testQA('User2', T2, 'Explain how React virtual DOM works briefly.')
  ]);

  for (const r of [qa1, qa2]) {
    console.log(`  ${r.label}:`);
    if (r.error) { console.log('    ERROR: ' + r.error); continue; }
    row('    TTFB (first byte):', r.ttfb + 'ms');
    row('    Total stream time:', r.total + 'ms');
    row('    SSE chunks:', String(r.chunks));
    row('    Answer length:', r.answerLen + ' chars');
    row('    Throughput:', r.tokensPerSec + ' words/sec');
    row('    Preview:', r.preview.slice(0, 80) + '...');
    console.log('');
  }

  // ── TEST 3: Concurrent Screen Analysis ──────────────
  hdr('TEST 3: Screen Analysis (/interview/code-suggest)');
  console.log('  Sending synthetic image to both users concurrently...\n');

  const [sc1, sc2] = await Promise.all([
    testScreenAnalysis('User1', T1),
    testScreenAnalysis('User2', T2)
  ]);

  for (const r of [sc1, sc2]) {
    console.log(`  ${r.label}:`);
    if (r.error) { console.log('    ERROR: ' + r.error); continue; }
    row('    TTFB:', r.ttfb + 'ms');
    row('    Total:', r.total + 'ms');
    row('    HTTP status:', String(r.status));
    row('    Detected code:', String(r.detected));
    row('    Language:', r.language || 'N/A');
    row('    Context:', r.context || 'N/A');
    console.log('');
  }

  // ── TEST 4: WebSocket Connection (Deepgram proxy) ───
  hdr('TEST 4: WebSocket (Deepgram STT Proxy) Connection');
  console.log('  Connecting 2 WebSockets concurrently...\n');

  const [ws1, ws2] = await Promise.all([
    testWSConnect('User1', T1),
    testWSConnect('User2', T2)
  ]);

  for (const r of [ws1, ws2]) {
    console.log(`  ${r.label}:`);
    if (r.error) { console.log('    ERROR: ' + r.error); continue; }
    row('    WS open:', r.openMs + 'ms');
    row('    First message:', r.firstMsgMs + 'ms');
    row('    Message type:', r.msgType || 'N/A');
    console.log('');
  }

  // ── TEST 5: Sequential Follow-up Q&A (context retention) ──
  hdr('TEST 5: Follow-up Q&A (context retention + latency)');
  console.log('  User1: 3 sequential questions to test chat memory\n');

  const followups = await testSequentialQA('User1', T1, [
    'What is your experience with Node.js?',
    'Can you tell me more about the specific projects you worked on?',
    'What challenges did you face in those projects?'
  ]);

  followups.forEach((r, i) => {
    console.log(`  Q${i + 1}:`);
    if (r.error) { console.log('    ERROR: ' + r.error); return; }
    row('    TTFB:', r.ttfb + 'ms');
    row('    Total:', r.total + 'ms');
    row('    Answer:', r.answerLen + ' chars');
    row('    Throughput:', r.tokensPerSec + ' words/sec');
    console.log('');
  });

  // ── TEST 6: Mixed Load (Q&A + Screen Analysis simultaneously) ──
  hdr('TEST 6: Mixed Load (Q&A + Screen Analysis at same time)');
  console.log('  User1: Q&A question  |  User2: Screen analysis\n');

  const mixT0 = Date.now();
  const [mix1, mix2] = await Promise.all([
    testQA('User1-QA', T1, 'How would you design a rate limiter for an API?'),
    testScreenAnalysis('User2-Screen', T2)
  ]);
  const mixTotal = Date.now() - mixT0;

  console.log('  User1 (Q&A):');
  if (mix1.error) { console.log('    ERROR: ' + mix1.error); }
  else {
    row('    TTFB:', mix1.ttfb + 'ms');
    row('    Total:', mix1.total + 'ms');
    row('    Answer:', mix1.answerLen + ' chars');
  }
  console.log('  User2 (Screen):');
  if (mix2.error) { console.log('    ERROR: ' + mix2.error); }
  else {
    row('    TTFB:', mix2.ttfb + 'ms');
    row('    Total:', mix2.total + 'ms');
    row('    Detected:', String(mix2.detected));
  }
  row('  Wall-clock (parallel):', mixTotal + 'ms');

  // ── Cleanup ─────────────────────────────────────────
  hdr('CLEANUP: Ending both sessions');
  const [e1, e2] = await Promise.all([
    post('/interview/end', T1, {}).then(r => r.json()),
    post('/interview/end', T2, {}).then(r => r.json())
  ]);
  row('User1:', JSON.stringify(e1));
  row('User2:', JSON.stringify(e2));

  // ── Summary ─────────────────────────────────────────
  hdr('PERFORMANCE SUMMARY');
  console.log('');
  console.log('  Session init (per user):     ~' + Math.round((s1.ms + s2.ms) / 2) + 'ms avg');
  if (!qa1.error && !qa2.error) {
    console.log('  Q&A TTFB (first byte):       ~' + Math.round((qa1.ttfb + qa2.ttfb) / 2) + 'ms avg');
    console.log('  Q&A total stream:            ~' + Math.round((qa1.total + qa2.total) / 2) + 'ms avg');
    console.log('  Q&A throughput:              ~' + Math.round((qa1.tokensPerSec + qa2.tokensPerSec) / 2) + ' words/sec avg');
  }
  if (!sc1.error && !sc2.error) {
    console.log('  Screen analysis:             ~' + Math.round((sc1.total + sc2.total) / 2) + 'ms avg');
  }
  if (!ws1.error && !ws2.error) {
    console.log('  WebSocket connect:           ~' + Math.round((ws1.openMs + ws2.openMs) / 2) + 'ms avg');
    console.log('  Deepgram first response:     ~' + Math.round((ws1.firstMsgMs + ws2.firstMsgMs) / 2) + 'ms avg');
  }
  console.log('');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
