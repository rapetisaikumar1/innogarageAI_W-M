/**
 * Concurrent Performance Test — 10 Users
 */

const BASE = 'https://innogarage-ai-production.up.railway.app';
const N = 10;

const TOKENS = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNjE0NjI2MC1jMmMxLTRhMjYtYTYzMy03ZTUzZWU2NWZkZDYiLCJlbWFpbCI6InNhaWt1bWFyYXBldGkxQGdtYWlsLmNvbSIsImlhdCI6MTc3NjQ0MjY5MiwiZXhwIjoxNzc2NDQ2MjkyfQ.KMYliAMPUO9K0aFnhFk_mdVaf63aZmp80-DBuATnFPQ',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3MjhkMGY0Ni1kY2IyLTRiMGItYTA1Yi0wMGI0ZDg5NTRiZTEiLCJlbWFpbCI6InJhcGV0aXNhaWt1bWFyOTg2NkBnbWFpbC5jb20iLCJpYXQiOjE3NzY0NDI2OTIsImV4cCI6MTc3NjQ0NjI5Mn0.xlrsyTJqnmzVUpgrm6EOKH0BVzXsJaCNMiTQerd1jrw',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTk4NWNkMS1jNDU5LTQyNzQtOTdhYy1mZDgxZWJmMzBmMDYiLCJlbWFpbCI6InRlc3R1c2VyM0BwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjY5MiwiZXhwIjoxNzc2NDQ2MjkyfQ.Otof70GCZunsAU5_cvcJzae040xTu-Ysi_uHAC6P5as',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIyMDBkYzhmYy0xODRhLTQ2ZjUtYTEzYi1jNjdlZTc3NWM1NmMiLCJlbWFpbCI6InRlc3R1c2VyNEBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjY5MiwiZXhwIjoxNzc2NDQ2MjkyfQ.lL47yftOmo2ZzZjjBok37nZuQD3OXlRH8hKtAjPIj0o',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZDc2MDMyZS0xOTAxLTQ4M2EtYjQ1My04MjNmZTI0ZDA5MDEiLCJlbWFpbCI6InRlc3R1c2VyNUBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjY5MiwiZXhwIjoxNzc2NDQ2MjkyfQ.eQQ2zRRDuTZI_XJYmLUJo0jo2KLAR8oOjNeutu8_JYo',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjNWMwNDQ5Yi1kMGY2LTRhMTItYWViNC1jNzI3NjA4OTYxM2MiLCJlbWFpbCI6InRlc3R1c2VyNkBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjY5MiwiZXhwIjoxNzc2NDQ2MjkyfQ.7YdlSjgJRXNXY3xVWIXWxG50VO68iq5Eh_e3hkxsKmg',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZmI1ZGI1Ni05ODJhLTQ4MDYtYTQyYS1kNWIwZDcxZGY3ZGEiLCJlbWFpbCI6InRlc3R1c2VyN0BwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjY5MiwiZXhwIjoxNzc2NDQ2MjkyfQ.6Hga_k3rEFLfTLV0Bb0H3XQA49hFDb7LL_TXQ6OnXm4',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiM2RkZWMxYS1lMGE5LTQ3NjItYWRkYS02YmJlZTRjNjNmYjgiLCJlbWFpbCI6InRlc3R1c2VyOEBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjY5MiwiZXhwIjoxNzc2NDQ2MjkyfQ.fkoix_DItVVD-GVcrPCvZ_DeOWEmXorWnCRpORW2geo',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0M2Q1NGE1Yi05YmFmLTQ3NTMtYThkOC0zMjkwNWNmMTljZGMiLCJlbWFpbCI6InRlc3R1c2VyOUBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MjY5MiwiZXhwIjoxNzc2NDQ2MjkyfQ.VeHnK7Rf6_TPBZI1H8XzscwIe_WkaZwfV6A10c434jo',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1N2RhYzkyNC05YTIxLTQ5ZGUtOThjMi04MTZhZTE2YjdhYmMiLCJlbWFpbCI6InRlc3R1c2VyMTBAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDI2OTIsImV4cCI6MTc3NjQ0NjI5Mn0.RQPdafiH7klHf-D6hveenXxQMoWEqaMK7XnIOGRNQzw'
];

const QUESTIONS = [
  'What is a closure in JavaScript?',
  'Explain React virtual DOM briefly.',
  'SQL vs NoSQL differences?',
  'How does garbage collection work in Java?',
  'Explain microservices architecture.',
  'What is a binary search tree?',
  'Explain the CAP theorem.',
  'How does HTTPS encryption work?',
  'What are design patterns?',
  'Explain event-driven architecture.'
];

const QUESTIONS_R2 = [
  'How would you implement a LRU cache?',
  'Explain the observer pattern.',
  'What is database indexing and why is it important?',
  'Describe the difference between threads and processes.',
  'What is a message queue and when would you use one?',
  'Explain Big O notation with examples.',
  'How does DNS resolution work?',
  'What is containerization vs virtualization?',
  'Explain ACID properties in databases.',
  'What is a load balancer and how does it work?'
];

function hdr(text) {
  const w = 70;
  console.log('\n' + '='.repeat(w));
  console.log(' '.repeat(Math.max(0, Math.floor((w - text.length) / 2))) + text);
  console.log('='.repeat(w));
}
function row(label, value) { console.log('  ' + label.padEnd(32) + value); }

async function post(path, token, body) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body)
  });
}

async function testQA(i, token, question) {
  const label = 'U' + String(i).padStart(2, '0');
  const t0 = Date.now();
  let ttfb = 0, chunks = 0, answer = '';
  try {
    const res = await post('/interview/ask', token, { text: question });
    ttfb = Date.now() - t0;
    if (res.status !== 200) {
      return { label, error: 'HTTP ' + res.status, ttfb, total: Date.now() - t0 };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks++;
      for (const line of dec.decode(value, { stream: true }).split('\n')) {
        if (line.startsWith('data: ')) {
          const p = line.slice(6).trim();
          if (p === '[DONE]') continue;
          try { answer += JSON.parse(p).text || ''; } catch {}
        }
      }
    }
  } catch (e) { return { label, error: e.message, total: Date.now() - t0 }; }
  const total = Date.now() - t0;
  const words = answer.split(/\s+/).filter(Boolean).length;
  return { label, ttfb, total, chunks, chars: answer.length, words, wps: total > 0 ? Math.round(words / (total / 1000)) : 0 };
}

async function testScreen(i, token) {
  const label = 'U' + String(i).padStart(2, '0');
  // Minimal valid JPEG
  const img = Buffer.from([0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0x7B,0x94,0x11,0x00,0x00,0x00,0x00,0xFF,0xD9]).toString('base64');
  const t0 = Date.now();
  try {
    const res = await post('/interview/code-suggest', token, { image: img });
    const ttfb = Date.now() - t0;
    const body = await res.json();
    return { label, ttfb, total: Date.now() - t0, status: res.status, detected: body.detected };
  } catch (e) { return { label, error: e.message, total: Date.now() - t0 }; }
}

function stats(arr, key) {
  const vals = arr.filter(r => !r.error).map(r => r[key]);
  if (!vals.length) return { avg: 0, min: 0, max: 0, p50: 0, p95: 0 };
  vals.sort((a, b) => a - b);
  return {
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    min: vals[0],
    max: vals[vals.length - 1],
    p50: vals[Math.floor(vals.length * 0.5)],
    p95: vals[Math.floor(vals.length * 0.95)]
  };
}

async function main() {
  console.log('');
  console.log('######################################################################');
  console.log('#     INNOGARAGE.AI — CONCURRENT PERFORMANCE TEST (10 USERS)         #');
  console.log('#     Server: ' + BASE.padEnd(55) + '#');
  console.log('#     Time:   ' + new Date().toISOString().padEnd(55) + '#');
  console.log('######################################################################');

  // ── TEST 1: 10 Concurrent Session Starts ────────────
  hdr('TEST 1: Session Init — 10 users concurrent');

  const t1 = Date.now();
  const starts = await Promise.all(TOKENS.map(async (tok, i) => {
    const t = Date.now();
    const r = await post('/interview/start', tok, {});
    const b = await r.json();
    return { i: i + 1, ms: Date.now() - t, ok: r.status === 200, msg: b.message || b.error };
  }));
  const t1wall = Date.now() - t1;

  const sOk = starts.filter(s => s.ok);
  const sFail = starts.filter(s => !s.ok);
  starts.forEach(s => {
    const tag = s.ok ? 'OK' : 'FAIL';
    process.stdout.write('  U' + String(s.i).padStart(2, '0') + ': ' + s.ms + 'ms [' + tag + ']  ');
    if (s.i % 5 === 0) console.log('');
  });
  console.log('');
  const sAvg = Math.round(starts.reduce((a, s) => a + s.ms, 0) / N);
  row('Success:', sOk.length + '/' + N);
  row('Avg init time:', sAvg + 'ms');
  row('Wall-clock (parallel):', t1wall + 'ms');
  row('Concurrency savings:', Math.round((1 - t1wall / (sAvg * N)) * 100) + '%');
  if (sFail.length) sFail.forEach(s => console.log('  FAILED U' + s.i + ': ' + s.msg));

  // ── TEST 2: 10 Concurrent Q&A ──────────────────────
  hdr('TEST 2: Q&A Pipeline — 10 concurrent SSE streams');

  const t2 = Date.now();
  const qa = await Promise.all(TOKENS.map((tok, i) => testQA(i + 1, tok, QUESTIONS[i])));
  const t2wall = Date.now() - t2;

  console.log('  ' + '-'.repeat(66));
  console.log('  ' + 'User'.padEnd(6) + 'TTFB'.padEnd(10) + 'Total'.padEnd(10) + 'Chunks'.padEnd(9) + 'Chars'.padEnd(8) + 'Words'.padEnd(8) + 'W/s'.padEnd(8) + 'Status');
  console.log('  ' + '-'.repeat(66));
  qa.forEach(r => {
    if (r.error) {
      console.log('  ' + r.label.padEnd(6) + ('ERR: ' + r.error).slice(0, 60));
    } else {
      console.log('  ' + r.label.padEnd(6) + (r.ttfb + 'ms').padEnd(10) + (r.total + 'ms').padEnd(10) +
        String(r.chunks).padEnd(9) + String(r.chars).padEnd(8) + String(r.words).padEnd(8) +
        String(r.wps).padEnd(8) + 'OK');
    }
  });
  console.log('  ' + '-'.repeat(66));

  const qaOk = qa.filter(r => !r.error);
  const qaTTFB = stats(qa, 'ttfb');
  const qaTotal = stats(qa, 'total');
  const qaWPS = stats(qa, 'wps');
  console.log('');
  row('Success:', qaOk.length + '/' + N);
  row('TTFB avg|p50|p95|max:', qaTTFB.avg + '|' + qaTTFB.p50 + '|' + qaTTFB.p95 + '|' + qaTTFB.max + ' ms');
  row('Total avg|p50|p95|max:', qaTotal.avg + '|' + qaTotal.p50 + '|' + qaTotal.p95 + '|' + qaTotal.max + ' ms');
  row('Throughput avg|min|max:', qaWPS.avg + '|' + qaWPS.min + '|' + qaWPS.max + ' w/s');
  row('Wall-clock (parallel):', t2wall + 'ms');

  // ── TEST 3: 10 Concurrent Screen Analysis ──────────
  hdr('TEST 3: Screen Analysis — 10 concurrent requests');

  const t3 = Date.now();
  const sc = await Promise.all(TOKENS.map((tok, i) => testScreen(i + 1, tok)));
  const t3wall = Date.now() - t3;

  console.log('  ' + '-'.repeat(50));
  console.log('  ' + 'User'.padEnd(6) + 'TTFB'.padEnd(10) + 'Total'.padEnd(10) + 'HTTP'.padEnd(7) + 'Detect'.padEnd(9) + 'Status');
  console.log('  ' + '-'.repeat(50));
  sc.forEach(r => {
    if (r.error && !r.status) {
      console.log('  ' + r.label.padEnd(6) + ('ERR: ' + r.error).slice(0, 44));
    } else {
      console.log('  ' + r.label.padEnd(6) + (r.ttfb + 'ms').padEnd(10) + (r.total + 'ms').padEnd(10) +
        String(r.status).padEnd(7) + String(r.detected ?? 'err').padEnd(9) +
        (r.status === 200 ? 'OK' : 'ERR'));
    }
  });
  console.log('  ' + '-'.repeat(50));
  const scOk = sc.filter(r => r.status === 200);
  const scT = stats(sc.filter(r => r.status === 200), 'total');
  console.log('');
  row('Success:', scOk.length + '/' + N);
  row('Total avg|p50|p95|max:', scT.avg + '|' + scT.p50 + '|' + scT.p95 + '|' + scT.max + ' ms');
  row('Wall-clock (parallel):', t3wall + 'ms');

  // ── TEST 4: Mixed Load — 10 Q&A + 10 Screen at once ─
  hdr('TEST 4: Mixed Load — 10 Q&A + 10 Screen (20 concurrent)');

  const t4 = Date.now();
  const mixed = await Promise.all([
    ...TOKENS.map((tok, i) => testQA(i + 1, tok, QUESTIONS_R2[i])),
    ...TOKENS.map((tok, i) => testScreen(i + 1, tok))
  ]);
  const t4wall = Date.now() - t4;

  const mQA = mixed.slice(0, N);
  const mSC = mixed.slice(N);
  const mQAok = mQA.filter(r => !r.error);
  const mSCok = mSC.filter(r => r.status === 200);

  console.log('  Q&A (10 streams):');
  mQA.forEach(r => {
    if (r.error) console.log('    ' + r.label + ': ERR — ' + r.error.slice(0, 50));
    else console.log('    ' + r.label + ': TTFB=' + r.ttfb + 'ms  Total=' + r.total + 'ms  ' + r.chars + 'ch  ' + r.wps + 'w/s');
  });
  console.log('');
  console.log('  Screen Analysis (10 reqs):');
  mSC.forEach(r => {
    if (r.error && !r.status) console.log('    ' + r.label + ': ERR — ' + r.error.slice(0, 50));
    else console.log('    ' + r.label + ': ' + r.total + 'ms  HTTP=' + r.status + '  det=' + r.detected);
  });

  const mQAttfb = stats(mQA, 'ttfb');
  const mQAtot = stats(mQA, 'total');
  const mSCtot = stats(mSC.filter(r => r.status === 200), 'total');
  console.log('');
  row('Q&A success:', mQAok.length + '/' + N);
  row('Q&A TTFB avg:', mQAttfb.avg + 'ms');
  row('Q&A total avg:', mQAtot.avg + 'ms');
  row('Screen success:', mSCok.length + '/' + N);
  row('Screen total avg:', mSCtot.avg + 'ms');
  row('Wall-clock (20 reqs):', t4wall + 'ms');

  // ── Cleanup ─────────────────────────────────────────
  hdr('CLEANUP');
  await Promise.all(TOKENS.map(t => post('/interview/end', t, {})));
  console.log('  All 10 sessions ended.');

  // ── GRAND SUMMARY ──────────────────────────────────
  hdr('PERFORMANCE SUMMARY — 10 CONCURRENT USERS');
  console.log('');

  row('Session init (avg):', sAvg + 'ms');
  row('Session init success:', sOk.length + '/' + N);
  console.log('');
  row('Q&A TTFB (avg):', qaTTFB.avg + 'ms');
  row('Q&A TTFB (p95):', qaTTFB.p95 + 'ms');
  row('Q&A total (avg):', qaTotal.avg + 'ms');
  row('Q&A total (p95):', qaTotal.p95 + 'ms');
  row('Q&A throughput (avg):', qaWPS.avg + ' words/sec');
  row('Q&A success:', qaOk.length + '/' + N);
  console.log('');
  row('Screen analysis (avg):', scT.avg + 'ms');
  row('Screen analysis (p95):', scT.p95 + 'ms');
  row('Screen success:', scOk.length + '/' + N);
  console.log('');
  row('Mixed load Q&A TTFB (avg):', mQAttfb.avg + 'ms');
  row('Mixed load Q&A total (avg):', mQAtot.avg + 'ms');
  row('Mixed load screen (avg):', mSCtot.avg + 'ms');

  console.log('');
  console.log('  ── Comparison across scales ──');
  console.log('  ' + ''.padEnd(24) + '2 users'.padEnd(14) + '5 users'.padEnd(14) + '10 users');
  console.log('  ' + '-'.repeat(66));
  console.log('  ' + 'Q&A TTFB avg'.padEnd(24) + '419ms'.padEnd(14) + '401ms'.padEnd(14) + qaTTFB.avg + 'ms');
  console.log('  ' + 'Q&A total avg'.padEnd(24) + '2863ms'.padEnd(14) + '2398ms'.padEnd(14) + qaTotal.avg + 'ms');
  console.log('  ' + 'Q&A throughput'.padEnd(24) + '57 w/s'.padEnd(14) + '58 w/s'.padEnd(14) + qaWPS.avg + ' w/s');
  console.log('  ' + 'Screen avg'.padEnd(24) + '5004ms'.padEnd(14) + '1619ms'.padEnd(14) + scT.avg + 'ms');
  console.log('  ' + 'Init avg'.padEnd(24) + '1042ms'.padEnd(14) + '1161ms'.padEnd(14) + sAvg + 'ms');
  console.log('');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
