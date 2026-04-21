/**
 * Concurrent Performance Test — 5 Users
 * Tests Q&A pipeline (SSE) and screen analysis pipeline simultaneously
 */

const BASE = 'https://innogarage-ai-production.up.railway.app';

const TOKENS = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNjE0NjI2MC1jMmMxLTRhMjYtYTYzMy03ZTUzZWU2NWZkZDYiLCJlbWFpbCI6InNhaWt1bWFyYXBldGkxQGdtYWlsLmNvbSIsImlhdCI6MTc3NjQ0MjQxMSwiZXhwIjoxNzc2NDQ2MDExfQ.4fljEmV5JwGhb8rQ6DeRG35ycb2TP_TwHz9wqVOCxwQ',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3MjhkMGY0Ni1kY2IyLTRiMGItYTA1Yi0wMGI0ZDg5NTRiZTEiLCJlbWFpbCI6InJhcGV0aXNhaWt1bWFyOTg2NkBnbWFpbC5jb20iLCJpYXQiOjE3NzY0NDI0MTEsImV4cCI6MTc3NjQ0NjAxMX0.jEwm3xbgGlydoRvdfOl-jQDLBuKS4QvGC1a8dxLAeeo',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTk4NWNkMS1jNDU5LTQyNzQtOTdhYy1mZDgxZWJmMzBmMDYiLCJlbWFpbCI6InRlc3R1c2VyM0BwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjQxMSwiZXhwIjoxNzc2NDQ2MDExfQ.tKJ4-E2WjDuaH4rG37sBXMXt0h7UyJ2FEm6TV7asgMM',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIyMDBkYzhmYy0xODRhLTQ2ZjUtYTEzYi1jNjdlZTc3NWM1NmMiLCJlbWFpbCI6InRlc3R1c2VyNEBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjQxMSwiZXhwIjoxNzc2NDQ2MDExfQ.DyXXii9adpUqSJGIWSlrgovV5WrllTaSyh9PfkwGqTk',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZDc2MDMyZS0xOTAxLTQ4M2EtYjQ1My04MjNmZTI0ZDA5MDEiLCJlbWFpbCI6InRlc3R1c2VyNUBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjQxMSwiZXhwIjoxNzc2NDQ2MDExfQ.ld2zyXnj_gXl_0A3Qt1gaLMf__MsUQkZxQxyW4Lt_sc'
];

const QA_QUESTIONS = [
  'What is a closure in JavaScript? Give a brief example.',
  'Explain how React virtual DOM works briefly.',
  'What is the difference between SQL and NoSQL databases?',
  'How does garbage collection work in Java?',
  'Explain the concept of microservices architecture briefly.'
];

// ── Helpers ──────────────────────────────────────────

function hdr(text) {
  const w = 68;
  const pad = Math.max(0, Math.floor((w - text.length) / 2));
  console.log('\n' + '='.repeat(w));
  console.log(' '.repeat(pad) + text);
  console.log('='.repeat(w));
}

function row(label, value) {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

async function post(path, token, body) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body)
  });
}

// ── Q&A SSE Test ─────────────────────────────────────

async function testQA(userNum, token, question) {
  const label = 'User' + userNum;
  const t0 = Date.now();
  let ttfb = 0, chunks = 0, answer = '';
  try {
    const res = await post('/interview/ask', token, { text: question });
    ttfb = Date.now() - t0;
    if (res.status !== 200) {
      const body = await res.text();
      return { label, error: 'HTTP ' + res.status + ': ' + body.slice(0, 100), ttfb, total: Date.now() - t0 };
    }
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
    return { label, error: e.message, total: Date.now() - t0 };
  }
  const total = Date.now() - t0;
  const words = answer.split(/\s+/).filter(Boolean).length;
  const tokensPerSec = total > 0 ? Math.round(words / (total / 1000)) : 0;
  return { label, ttfb, total, chunks, answerLen: answer.length, words, tokensPerSec, preview: answer.slice(0, 100) };
}

// ── Screen Analysis Test ─────────────────────────────

function makeSyntheticImage() {
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

async function testScreen(userNum, token) {
  const label = 'User' + userNum;
  const image = makeSyntheticImage();
  const t0 = Date.now();
  try {
    const res = await post('/interview/code-suggest', token, { image });
    const ttfb = Date.now() - t0;
    const body = await res.json();
    const total = Date.now() - t0;
    return { label, ttfb, total, status: res.status, detected: body.detected, context: (body.context || '').slice(0, 60), error: body.error };
  } catch (e) {
    return { label, error: e.message, total: Date.now() - t0 };
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('####################################################################');
  console.log('#    INNOGARAGE.AI — CONCURRENT PERFORMANCE TEST (5 USERS)         #');
  console.log('#    Server: ' + BASE.padEnd(53) + '#');
  console.log('#    Time:   ' + new Date().toISOString().padEnd(53) + '#');
  console.log('####################################################################');

  // ── TEST 1: 5 Concurrent Session Starts ─────────────
  hdr('TEST 1: Session Init — 5 users concurrent');
  console.log('  Starting all 5 sessions simultaneously...\n');

  const startT0 = Date.now();
  const starts = await Promise.all(
    TOKENS.map(async (token, i) => {
      const t = Date.now();
      const res = await post('/interview/start', token, {});
      const body = await res.json();
      return { user: 'User' + (i + 1), ms: Date.now() - t, status: res.status, msg: body.message || body.error };
    })
  );
  const startWall = Date.now() - startT0;

  starts.forEach(s => row(s.user + ':', s.ms + 'ms (HTTP ' + s.status + ') — ' + s.msg));
  console.log('');
  const avgStart = Math.round(starts.reduce((a, s) => a + s.ms, 0) / starts.length);
  row('Avg per user:', avgStart + 'ms');
  row('Wall-clock (parallel):', startWall + 'ms');
  row('Concurrency savings:', Math.round((1 - startWall / (avgStart * 5)) * 100) + '%');

  // ── TEST 2: 5 Concurrent Q&A SSE ───────────────────
  hdr('TEST 2: Q&A Pipeline — 5 concurrent SSE streams');
  QA_QUESTIONS.forEach((q, i) => console.log('  User' + (i + 1) + ': "' + q.slice(0, 55) + '..."'));
  console.log('');

  const qaT0 = Date.now();
  const qaResults = await Promise.all(
    TOKENS.map((token, i) => testQA(i + 1, token, QA_QUESTIONS[i]))
  );
  const qaWall = Date.now() - qaT0;

  console.log('  ' + '-'.repeat(64));
  console.log('  ' + 'User'.padEnd(8) + 'TTFB'.padEnd(10) + 'Total'.padEnd(10) + 'Chunks'.padEnd(9) + 'Chars'.padEnd(9) + 'Words/s'.padEnd(10) + 'Status');
  console.log('  ' + '-'.repeat(64));
  let qaErrors = 0;
  qaResults.forEach(r => {
    if (r.error) {
      console.log('  ' + r.label.padEnd(8) + ('ERR: ' + r.error).slice(0, 56));
      qaErrors++;
    } else {
      console.log('  ' + r.label.padEnd(8) +
        (r.ttfb + 'ms').padEnd(10) +
        (r.total + 'ms').padEnd(10) +
        String(r.chunks).padEnd(9) +
        String(r.answerLen).padEnd(9) +
        String(r.tokensPerSec).padEnd(10) +
        'OK'
      );
    }
  });
  console.log('  ' + '-'.repeat(64));
  const qaSuccess = qaResults.filter(r => !r.error);
  if (qaSuccess.length > 0) {
    const avgTTFB = Math.round(qaSuccess.reduce((a, r) => a + r.ttfb, 0) / qaSuccess.length);
    const avgTotal = Math.round(qaSuccess.reduce((a, r) => a + r.total, 0) / qaSuccess.length);
    const avgWPS = Math.round(qaSuccess.reduce((a, r) => a + r.tokensPerSec, 0) / qaSuccess.length);
    const minTTFB = Math.min(...qaSuccess.map(r => r.ttfb));
    const maxTTFB = Math.max(...qaSuccess.map(r => r.ttfb));
    const minTotal = Math.min(...qaSuccess.map(r => r.total));
    const maxTotal = Math.max(...qaSuccess.map(r => r.total));
    console.log('');
    row('Success rate:', qaSuccess.length + '/5');
    row('Avg TTFB:', avgTTFB + 'ms (min ' + minTTFB + ', max ' + maxTTFB + ')');
    row('Avg total:', avgTotal + 'ms (min ' + minTotal + ', max ' + maxTotal + ')');
    row('Avg throughput:', avgWPS + ' words/sec');
    row('Wall-clock (parallel):', qaWall + 'ms');
  }

  // ── TEST 3: 5 Concurrent Screen Analysis ────────────
  hdr('TEST 3: Screen Analysis — 5 concurrent requests');
  console.log('  Sending synthetic image to all 5 users...\n');

  const scT0 = Date.now();
  const scResults = await Promise.all(
    TOKENS.map((token, i) => testScreen(i + 1, token))
  );
  const scWall = Date.now() - scT0;

  console.log('  ' + '-'.repeat(58));
  console.log('  ' + 'User'.padEnd(8) + 'TTFB'.padEnd(10) + 'Total'.padEnd(10) + 'HTTP'.padEnd(7) + 'Detected'.padEnd(11) + 'Status');
  console.log('  ' + '-'.repeat(58));
  scResults.forEach(r => {
    if (r.error && !r.status) {
      console.log('  ' + r.label.padEnd(8) + ('ERR: ' + r.error).slice(0, 50));
    } else {
      console.log('  ' + r.label.padEnd(8) +
        (r.ttfb + 'ms').padEnd(10) +
        (r.total + 'ms').padEnd(10) +
        String(r.status).padEnd(7) +
        String(r.detected ?? 'err').padEnd(11) +
        (r.status === 200 ? 'OK' : 'ERR: ' + (r.error || '').slice(0, 20))
      );
    }
  });
  console.log('  ' + '-'.repeat(58));
  const scSuccess = scResults.filter(r => r.status === 200);
  if (scSuccess.length > 0) {
    const avgSc = Math.round(scSuccess.reduce((a, r) => a + r.total, 0) / scSuccess.length);
    console.log('');
    row('Success rate:', scSuccess.length + '/5');
    row('Avg response time:', avgSc + 'ms');
    row('Wall-clock (parallel):', scWall + 'ms');
  }

  // ── TEST 4: Mixed Load — All 5 Q&A + All 5 Screen simultaneously ──
  hdr('TEST 4: Mixed Load — 5 Q&A + 5 Screen Analysis at once');
  console.log('  10 total concurrent requests (5 SSE + 5 REST)...\n');

  const mixQuestions = [
    'How would you design a rate limiter?',
    'Explain event-driven architecture briefly.',
    'What is database sharding?',
    'How does HTTPS work?',
    'What are design patterns? Name a few.'
  ];

  const mixT0 = Date.now();
  const mixAll = await Promise.all([
    ...TOKENS.map((token, i) => testQA(i + 1, token, mixQuestions[i])),
    ...TOKENS.map((token, i) => testScreen(i + 1, token))
  ]);
  const mixWall = Date.now() - mixT0;

  const mixQA = mixAll.slice(0, 5);
  const mixSC = mixAll.slice(5);

  console.log('  Q&A Results:');
  mixQA.forEach(r => {
    if (r.error) console.log('    ' + r.label + ': ERR — ' + r.error.slice(0, 60));
    else console.log('    ' + r.label + ': TTFB=' + r.ttfb + 'ms  Total=' + r.total + 'ms  ' + r.answerLen + ' chars  ' + r.tokensPerSec + ' w/s');
  });
  console.log('');
  console.log('  Screen Analysis Results:');
  mixSC.forEach(r => {
    if (r.error && !r.status) console.log('    ' + r.label + ': ERR — ' + r.error.slice(0, 60));
    else console.log('    ' + r.label + ': ' + r.total + 'ms  HTTP=' + r.status + '  detected=' + r.detected);
  });
  console.log('');
  row('Total wall-clock (10 reqs):', mixWall + 'ms');

  // ── TEST 5: Rapid-fire Q&A (back-to-back from one user) ──
  hdr('TEST 5: Rapid-fire Q&A — User1 sends 5 questions back-to-back');

  const rapidQs = [
    'What is polymorphism?',
    'Explain async/await in JavaScript.',
    'What is a REST API?',
    'How does load balancing work?',
    'What is Docker and why use it?'
  ];

  const rapidResults = [];
  for (const q of rapidQs) {
    const r = await testQA(1, TOKENS[0], q);
    rapidResults.push(r);
    console.log('  Q: "' + q.slice(0, 40) + '"');
    if (r.error) console.log('    ERR: ' + r.error);
    else console.log('    TTFB=' + r.ttfb + 'ms  Total=' + r.total + 'ms  ' + r.answerLen + ' chars  ' + r.tokensPerSec + ' w/s');
  }

  const rapidOK = rapidResults.filter(r => !r.error);
  if (rapidOK.length > 0) {
    console.log('');
    row('Success:', rapidOK.length + '/5');
    row('Avg TTFB:', Math.round(rapidOK.reduce((a, r) => a + r.ttfb, 0) / rapidOK.length) + 'ms');
    row('Avg total:', Math.round(rapidOK.reduce((a, r) => a + r.total, 0) / rapidOK.length) + 'ms');
    row('Avg throughput:', Math.round(rapidOK.reduce((a, r) => a + r.tokensPerSec, 0) / rapidOK.length) + ' words/sec');
  }

  // ── Cleanup ─────────────────────────────────────────
  hdr('CLEANUP');
  await Promise.all(TOKENS.map(t => post('/interview/end', t, {})));
  console.log('  All 5 sessions ended.');

  // ── GRAND SUMMARY ──────────────────────────────────
  hdr('PERFORMANCE SUMMARY — 5 CONCURRENT USERS');
  console.log('');

  const allQA = qaResults.filter(r => !r.error);
  const allSC = scResults.filter(r => r.status === 200);

  row('Session init (avg):', avgStart + 'ms');

  if (allQA.length > 0) {
    row('Q&A TTFB (avg):', Math.round(allQA.reduce((a, r) => a + r.ttfb, 0) / allQA.length) + 'ms');
    row('Q&A total stream (avg):', Math.round(allQA.reduce((a, r) => a + r.total, 0) / allQA.length) + 'ms');
    row('Q&A throughput (avg):', Math.round(allQA.reduce((a, r) => a + r.tokensPerSec, 0) / allQA.length) + ' words/sec');
    row('Q&A TTFB range:', Math.min(...allQA.map(r => r.ttfb)) + 'ms — ' + Math.max(...allQA.map(r => r.ttfb)) + 'ms');
    row('Q&A total range:', Math.min(...allQA.map(r => r.total)) + 'ms — ' + Math.max(...allQA.map(r => r.total)) + 'ms');
    row('Q&A success rate:', allQA.length + '/5');
  }

  if (allSC.length > 0) {
    row('Screen analysis (avg):', Math.round(allSC.reduce((a, r) => a + r.total, 0) / allSC.length) + 'ms');
    row('Screen success rate:', allSC.length + '/5');
  }

  // Compare with 2-user baseline
  console.log('');
  console.log('  ── Comparison with 2-user baseline ──');
  row('2-user Q&A TTFB avg:', '~419ms');
  row('2-user Q&A total avg:', '~2,863ms');
  row('2-user Q&A throughput:', '~57 words/sec');
  if (allQA.length > 0) {
    const cur_ttfb = Math.round(allQA.reduce((a, r) => a + r.ttfb, 0) / allQA.length);
    const cur_total = Math.round(allQA.reduce((a, r) => a + r.total, 0) / allQA.length);
    const cur_wps = Math.round(allQA.reduce((a, r) => a + r.tokensPerSec, 0) / allQA.length);
    row('5-user Q&A TTFB avg:', cur_ttfb + 'ms (' + (cur_ttfb > 419 ? '+' : '') + Math.round(((cur_ttfb - 419) / 419) * 100) + '%)');
    row('5-user Q&A total avg:', cur_total + 'ms (' + (cur_total > 2863 ? '+' : '') + Math.round(((cur_total - 2863) / 2863) * 100) + '%)');
    row('5-user Q&A throughput:', cur_wps + ' w/s (' + (cur_wps > 57 ? '+' : '') + Math.round(((cur_wps - 57) / 57) * 100) + '%)');
  }
  console.log('');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
