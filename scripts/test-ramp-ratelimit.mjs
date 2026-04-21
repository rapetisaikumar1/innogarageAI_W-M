/**
 * Focused Regressive Ramp-Up + Rate Limit Discovery Test
 * (Session re-init before each wave)
 */

const BASE = 'https://innogarage-ai-production.up.railway.app';
const N = 20;

const TOKENS = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNjE0NjI2MC1jMmMxLTRhMjYtYTYzMy03ZTUzZWU2NWZkZDYiLCJlbWFpbCI6InNhaWt1bWFyYXBldGkxQGdtYWlsLmNvbSIsImlhdCI6MTc3NjQ0MzAwNiwiZXhwIjoxNzc2NDUwMjA2fQ.3JEooZuvcM-bQ9Q3PaQKYHCBZHb3zeKwdAPqATQdPR4',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3MjhkMGY0Ni1kY2IyLTRiMGItYTA1Yi0wMGI0ZDg5NTRiZTEiLCJlbWFpbCI6InJhcGV0aXNhaWt1bWFyOTg2NkBnbWFpbC5jb20iLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.KXatHULW0dVML7Nj8XDdO-cVmn_XQdd82Vc1rh6GXqo',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMTk4NWNkMS1jNDU5LTQyNzQtOTdhYy1mZDgxZWJmMzBmMDYiLCJlbWFpbCI6InRlc3R1c2VyM0BwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MzAwNiwiZXhwIjoxNzc2NDUwMjA2fQ.UIjHf1YlWgOqyJY_9wEvt_tLmw3Ut3d8FWanr2Mnr-o',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIyMDBkYzhmYy0xODRhLTQ2ZjUtYTEzYi1jNjdlZTc3NWM1NmMiLCJlbWFpbCI6InRlc3R1c2VyNEBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MzAwNiwiZXhwIjoxNzc2NDUwMjA2fQ.HeiXe8J-2WGY8CNgoNJoFUTfbKb1LboGJ_UKFkZ6v8k',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZDc2MDMyZS0xOTAxLTQ4M2EtYjQ1My04MjNmZTI0ZDA5MDEiLCJlbWFpbCI6InRlc3R1c2VyNUBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MzAwNiwiZXhwIjoxNzc2NDUwMjA2fQ.ZFTyF96hVncWDCiABPnWjLxIupQUHRPk0KzYwlvtaOY',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjNWMwNDQ5Yi1kMGY2LTRhMTItYWViNC1jNzI3NjA4OTYxM2MiLCJlbWFpbCI6InRlc3R1c2VyNkBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MzAwNiwiZXhwIjoxNzc2NDUwMjA2fQ.M5A8csV1YINLb6C5-Ni4mOYQyQiJBjtlk5vJvI9I8_M',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZmI1ZGI1Ni05ODJhLTQ4MDYtYTQyYS1kNWIwZDcxZGY3ZGEiLCJlbWFpbCI6InRlc3R1c2VyN0BwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MzAwNiwiZXhwIjoxNzc2NDUwMjA2fQ.Ni5CqcYPezRvEPF_4XpHX6wjb1ocECkZeKhdExkEhaU',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiM2RkZWMxYS1lMGE5LTQ3NjItYWRkYS02YmJlZTRjNjNmYjgiLCJlbWFpbCI6InRlc3R1c2VyOEBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MzAwNiwiZXhwIjoxNzc2NDUwMjA2fQ.CI0KoMZX2yHg_SN7TOEmwwlr3-YI7LRuhpASus_u9vs',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0M2Q1NGE1Yi05YmFmLTQ3NTMtYThkOC0zMjkwNWNmMTljZGMiLCJlbWFpbCI6InRlc3R1c2VyOUBwZXJmdGVzdC5sb2NhbCIsImlhdCI6MTc3NjQ0MzAwNiwiZXhwIjoxNzc2NDUwMjA2fQ.qwt_v8qSsWzNmbTs09y02q-X_8ON2Uz1Yuk43b5EXAg',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1N2RhYzkyNC05YTIxLTQ5ZGUtOThjMi04MTZhZTE2YjdhYmMiLCJlbWFpbCI6InRlc3R1c2VyMTBAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.DECBzRwQAH2wHRSiTpm2MyOw6byXZg7QFMmicnsHZrg',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMTE4NGYwYy01YzQ1LTRiOGEtYmE2Yi0xNzViOGJlMGY2YWIiLCJlbWFpbCI6InRlc3R1c2VyMTFAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.N-SoWyGy9bAxCa_VLe54tcRRfvnfPPd7okPzAKlrLDk',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmMTdjOTExYy02ZGFmLTRiNjUtOTNlZC04MzRkM2JmMGJlYmEiLCJlbWFpbCI6InRlc3R1c2VyMTJAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.LOdcUAF3RXunaGOEYxJw_UyBP1mJeIZrmeAGN__0Igo',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxOWY0NzEyZC1lYmJjLTQxNTYtOWRlNi1mYzliN2E3ODZjYzAiLCJlbWFpbCI6InRlc3R1c2VyMTNAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.ZZi1EbenHkWE3mR0MLHYmi4Z1-GNj21M5qNOA1AXMyw',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MmM0NzI5Zi03MjU2LTRkNDMtOTI2OS01ZTNmNzQ0YTBkZTAiLCJlbWFpbCI6InRlc3R1c2VyMTRAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.fryTH6R0VqSNXEqXRmwkLfjzLKkWtDrKS2NvTcbxuu8',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMmQ5YWYxZi00YWVkLTRmN2QtYjAwMS02ZDhkNGVlYzBjNzQiLCJlbWFpbCI6InRlc3R1c2VyMTVAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.TULUii_eMb6Ai1Ihlh9lBmnImTKueceb3MJTjsT_W2Y',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlZGE5OTM3MC04Njg1LTRiOTMtOTlmYi02MjQwZGZjN2YwMjAiLCJlbWFpbCI6InRlc3R1c2VyMTZAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.9N4O9nUrXTAQuN0U01dtdwSq39XJ81or8yuh6KwfZ6s',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiZmQ3OTMxYS01NTg5LTQxNmUtYmEzOC00YWVkYzVlMDJjYTYiLCJlbWFpbCI6InRlc3R1c2VyMTdAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.J6iw2Ewk-6rXD8AIR9l9Ls47UDgNtuHVRJG73tHOV1k',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjMTI0YmQyMi0yM2M5LTQzMWItYTNjNS0wYmI0MTZhZmMzZDUiLCJlbWFpbCI6InRlc3R1c2VyMThAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.LY8rsFaNd8VrP0cWviWiyIsnEvivcsrX0zRbzoTE7qI',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDg5MDc0OC1iOTg3LTRhZWEtYjUzYy0zNzYzNzgxYWUzMmIiLCJlbWFpbCI6InRlc3R1c2VyMTlAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.AXClEslOF1gspOYHFCRYfKkko-TtxisczVW_5qyu6RI',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5ZjFlN2UyMC1hNzRjLTQ0MjAtOGY5Mi05NjBkN2UwNTU4NTUiLCJlbWFpbCI6InRlc3R1c2VyMjBAcGVyZnRlc3QubG9jYWwiLCJpYXQiOjE3NzY0NDMwMDYsImV4cCI6MTc3NjQ1MDIwNn0.dotBZdH7boPOI1LYxD7L7VtiOIZtePp2unUIjTuN1DI'
];

const QS = [
  ['What is a closure in JavaScript?','Explain React virtual DOM briefly.','SQL vs NoSQL differences?','How does garbage collection work in Java?','Explain microservices architecture.','What is a binary search tree?','Explain the CAP theorem.','How does HTTPS encryption work?','What are design patterns?','Explain event-driven architecture.','What is a hash table?','Explain TCP vs UDP.','What is dependency injection?','How does OAuth2 work?','Explain SOLID principles.','What is a RESTful API?','Describe MVC pattern.','How does a CDN work?','What is WebSocket?','Explain Docker containers.'],
  ['How to implement LRU cache?','Explain observer pattern.','What is database indexing?','Threads vs processes?','What is a message queue?','Explain Big O notation.','How does DNS work?','Containerization vs virtualization?','Explain ACID properties.','What is a load balancer?','How does React reconciliation work?','What is eventual consistency?','Explain pub/sub pattern.','What is a reverse proxy?','Describe circuit breaker pattern.','How do DB transactions work?','GraphQL vs REST?','Explain serverless.','Microservices anti-patterns?','How does B-tree index work?'],
  ['Explain Raft consensus.','What are CRDTs?','How does React Fiber work?','Explain saga pattern.','What is a bloom filter?','Describe vector clocks.','How does connection pooling work?','Explain sidecar pattern.','What is event sourcing?','Describe consistent hashing.','What is actor model?','How does memory-mapped IO work?','Explain bulkhead pattern.','What is a skip list?','Describe strangler fig pattern.','gRPC vs REST?','What is a trie?','Optimistic vs pessimistic locking?','What is outbox pattern?','Describe hexagonal architecture.'],
  ['How does JIT compiler work?','What is cooperative multitasking?','Explain lock-free data structures.','What is a Merkle tree?','Describe leader election.','How does memoization work?','What is two-phase commit?','Explain blue-green deployment.','What is a Fenwick tree?','Strong vs eventual consistency?','How does WebAssembly work?','What is reactor pattern?','Explain zero-copy networking.','What is a Raft log?','Describe CQRS pattern.','How does TLS handshake work?','What is persistent data structure?','Explain gossip protocol.','What is operational transformation?','Describe half-open connection.']
];

const JPEG_B64 = Buffer.from([0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0x7B,0x94,0x11,0x00,0x00,0x00,0x00,0xFF,0xD9]).toString('base64');

function hdr(t) { console.log('\n' + '='.repeat(76) + '\n' + ' '.repeat(Math.max(0,Math.floor((76-t.length)/2))) + t + '\n' + '='.repeat(76)); }
function row(l, v) { console.log('  ' + l.padEnd(36) + v); }

async function post(path, token, body) {
  return fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
}

async function testQA(i, token, question) {
  const label = 'U' + String(i).padStart(2, '0');
  const t0 = Date.now();
  let ttfb = 0, chunks = 0, answer = '';
  try {
    const res = await post('/interview/ask', token, { text: question });
    ttfb = Date.now() - t0;
    if (res.status !== 200) {
      const body = await res.text().catch(() => '');
      return { label, error: 'HTTP ' + res.status + ' ' + body.slice(0, 80), ttfb, total: Date.now() - t0, status: res.status };
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
  return { label, ttfb, total, chunks, words, wps: total > 0 ? Math.round(words / (total / 1000)) : 0, status: 200 };
}

async function testScreen(i, token) {
  const label = 'U' + String(i).padStart(2, '0');
  const t0 = Date.now();
  try {
    const res = await post('/interview/code-suggest', token, { image: JPEG_B64 });
    const ttfb = Date.now() - t0;
    const body = await res.json();
    return { label, ttfb, total: Date.now() - t0, status: res.status, detected: body.detected };
  } catch (e) { return { label, error: e.message, total: Date.now() - t0 }; }
}

function stats(arr, key) {
  const vals = arr.filter(r => !r.error && r[key] != null).map(r => r[key]);
  if (!vals.length) return { avg: 0, min: 0, max: 0, p50: 0, p95: 0 };
  vals.sort((a, b) => a - b);
  return { avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), min: vals[0], max: vals[vals.length - 1], p50: vals[Math.floor(vals.length * 0.5)], p95: vals[Math.floor(vals.length * 0.95)] };
}

async function initAllSessions() {
  await Promise.all(TOKENS.map(t => post('/interview/end', t, {}).catch(() => {})));
  await new Promise(r => setTimeout(r, 1500));
  const starts = await Promise.all(TOKENS.map(async tok => {
    const r = await post('/interview/start', tok, {});
    return r.status === 200;
  }));
  const ok = starts.filter(Boolean).length;
  console.log('  [Sessions initialized: ' + ok + '/' + N + ']');
  await new Promise(r => setTimeout(r, 500));
  return ok;
}

async function main() {
  console.log('');
  console.log('############################################################################');
  console.log('#   REGRESSIVE RAMP-UP + RATE LIMIT DISCOVERY (with session re-init)       #');
  console.log('#   Server: ' + BASE.padEnd(63) + '#');
  console.log('#   Time:   ' + new Date().toISOString().padEnd(63) + '#');
  console.log('############################################################################');

  const rampResults = [];

  // ════════════════════════════════════════════════════════════════════════
  // REGRESSIVE RAMP-UP: 20 → 40 → 60 → 80 → 100
  // Fresh sessions before each wave
  // ════════════════════════════════════════════════════════════════════════
  hdr('REGRESSIVE RAMP-UP — Finding True Breaking Point');
  console.log('  Strategy: Fresh session init before each wave, multiplied requests per user');
  console.log('');

  for (const multiplier of [1, 2, 3, 4, 5]) {
    const totalReqs = N * multiplier;
    const subtitle = totalReqs + ' concurrent Q&A (' + N + ' users × ' + multiplier + ' each)';
    console.log('  ── Wave ' + multiplier + ': ' + subtitle + ' ──');

    // Fresh session init
    const sessOk = await initAllSessions();
    if (sessOk < N * 0.5) {
      console.log('  ⚠ Session init failed for majority — aborting wave');
      rampResults.push({ totalReqs, ok: 0, fail: totalReqs, http429: 0, http5xx: 0, ttfb: { avg: 0 }, total: { avg: 0 }, wps: { avg: 0 }, wall: 0 });
      break;
    }

    const requests = [];
    for (let m = 0; m < multiplier; m++) {
      for (let u = 0; u < N; u++) {
        requests.push({ userIdx: u, question: QS[m % QS.length][u] });
      }
    }

    const tw = Date.now();
    const results = await Promise.all(
      requests.map(r => testQA(r.userIdx + 1, TOKENS[r.userIdx], r.question))
    );
    const wall = Date.now() - tw;

    const ok = results.filter(r => !r.error);
    const fail = results.filter(r => r.error);
    const http429 = results.filter(r => r.status === 429);
    const http500 = results.filter(r => r.status === 500 || r.status === 503);
    const ttfbS = stats(results, 'ttfb');
    const totalS = stats(results, 'total');
    const wpsS = stats(results, 'wps');

    row('Requests:', totalReqs + ' concurrent');
    row('Success:', ok.length + '/' + totalReqs + ' (' + Math.round(ok.length / totalReqs * 100) + '%)');
    if (http429.length) row('Rate limited (429):', http429.length);
    if (http500.length) row('Server errors (5xx):', http500.length);
    if (fail.length > 0 && fail.length <= 5) {
      fail.forEach(r => console.log('    Error: ' + r.label + ' — ' + (r.error || '').slice(0, 60)));
    } else if (fail.length > 5) {
      console.log('    First 5 errors:');
      fail.slice(0, 5).forEach(r => console.log('      ' + r.label + ' — ' + (r.error || '').slice(0, 55)));
      console.log('    ... and ' + (fail.length - 5) + ' more');
    }
    row('TTFB avg|p50|p95|max:', ttfbS.avg + '|' + ttfbS.p50 + '|' + ttfbS.p95 + '|' + ttfbS.max + ' ms');
    row('Total avg|p50|p95|max:', totalS.avg + '|' + totalS.p50 + '|' + totalS.p95 + '|' + totalS.max + ' ms');
    row('Throughput avg:', wpsS.avg + ' w/s');
    row('Wall-clock:', wall + 'ms');
    console.log('');

    rampResults.push({ totalReqs, ok: ok.length, fail: fail.length, http429: http429.length, http5xx: http500.length, ttfb: ttfbS, total: totalS, wps: wpsS, wall });

    if (fail.length > totalReqs * 0.5) {
      console.log('  ⚠ Failure rate > 50% — stopping ramp-up at ' + totalReqs + ' concurrent.');
      break;
    }

    console.log('  Cooling down 3s...');
    await new Promise(r => setTimeout(r, 3000));
  }

  // ════════════════════════════════════════════════════════════════════════
  // RATE LIMIT DISCOVERY — Rapid-fire from single user
  // ════════════════════════════════════════════════════════════════════════
  hdr('RATE LIMIT DISCOVERY — Rapid-Fire from User 1');
  console.log('  Testing Q&A (Gemini 2.5 Flash) and Screen (Gemini 2.5 Flash-Lite)');
  console.log('');

  // Init fresh session for User 1
  await post('/interview/end', TOKENS[0], {}).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  const initRes = await post('/interview/start', TOKENS[0], {});
  console.log('  User 1 session: HTTP ' + initRes.status);
  console.log('');

  // 6A: Q&A rapid-fire
  console.log('  ── Q&A Rapid-Fire (30 sequential requests) ──');
  const shortQs = [
    'What is a variable?','What is a function?','What is a loop?','What is an array?','What is a string?',
    'What is an object?','What is a class?','What is a method?','What is inheritance?','What is polymorphism?',
    'What is an interface?','What is abstraction?','What is a pointer?','What is a stack?','What is a queue?',
    'What is a set?','What is a map?','What is a graph?','What is a tree?','What is a node?',
    'What is recursion?','What is iteration?','What is a callback?','What is a promise?','What is async/await?',
    'What is a closure?','What is scope?','What is hoisting?','What is a prototype?','What is this keyword?'
  ];

  const qaRateResults = [];
  const qaStart = Date.now();
  let qa429 = 0, qaErr = 0;

  for (let i = 0; i < shortQs.length; i++) {
    if (Date.now() - qaStart > 120000) { console.log('    Timeout'); break; }
    const t0 = Date.now();
    const r = await testQA(1, TOKENS[0], shortQs[i]);
    const elapsed = Date.now() - qaStart;
    const rpm = Math.round((i + 1) / (elapsed / 60000));

    if (r.error) {
      qaErr++;
      if (r.status === 429) qa429++;
      process.stdout.write('    #' + String(i+1).padStart(2) + ' ' + (Date.now()-t0) + 'ms ERR[' + (r.status||'net') + '] rpm~' + rpm + '\n');
    } else {
      process.stdout.write('    #' + String(i+1).padStart(2) + ' TTFB=' + r.ttfb + 'ms total=' + r.total + 'ms ' + r.words + 'w rpm~' + rpm + '\n');
    }
    qaRateResults.push(r);
  }

  const qaElapsed = Date.now() - qaStart;
  const qaOk = qaRateResults.filter(r => !r.error).length;
  console.log('');
  row('Completed:', qaRateResults.length + ' in ' + Math.round(qaElapsed/1000) + 's');
  row('Success:', qaOk + '/' + qaRateResults.length);
  row('Rate limited (429):', String(qa429));
  row('Effective RPM:', Math.round(qaOk / (qaElapsed / 60000)) + ' req/min');
  row('Avg TTFB:', stats(qaRateResults, 'ttfb').avg + 'ms');

  await new Promise(r => setTimeout(r, 2000));

  // 6B: Screen rapid-fire
  console.log('');
  console.log('  ── Screen Analysis Rapid-Fire (30 sequential requests) ──');
  const scRateResults = [];
  const scStart = Date.now();
  let sc429 = 0, scErr = 0;

  for (let i = 0; i < 30; i++) {
    if (Date.now() - scStart > 120000) { console.log('    Timeout'); break; }
    const t0 = Date.now();
    const r = await testScreen(1, TOKENS[0]);
    const elapsed = Date.now() - scStart;
    const rpm = Math.round((i + 1) / (elapsed / 60000));

    if (r.status === 429) sc429++;
    if (r.error || r.status !== 200) scErr++;

    process.stdout.write('    #' + String(i+1).padStart(2) + ' ' + r.total + 'ms HTTP=' + (r.status||'ERR') + ' rpm~' + rpm + '\n');
    scRateResults.push(r);
  }

  const scElapsed = Date.now() - scStart;
  const scOk = scRateResults.filter(r => r.status === 200).length;
  console.log('');
  row('Completed:', scRateResults.length + ' in ' + Math.round(scElapsed/1000) + 's');
  row('Success:', scOk + '/' + scRateResults.length);
  row('Rate limited (429):', String(sc429));
  row('Effective RPM:', Math.round(scOk / (scElapsed / 60000)) + ' req/min');

  // ════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ════════════════════════════════════════════════════════════════════════
  await Promise.all(TOKENS.map(t => post('/interview/end', t, {}).catch(() => {})));

  // ════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  hdr('SUMMARY');
  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────────────┐');
  console.log('  │                   REGRESSIVE RAMP-UP RESULTS                     │');
  console.log('  ├──────────┬──────────┬──────────┬──────────┬──────────┬───────────┤');
  console.log('  │ Conc.Req │ Success  │ 429s     │ 5xx      │ TTFB avg │ Total avg │');
  console.log('  ├──────────┼──────────┼──────────┼──────────┼──────────┼───────────┤');
  for (const r of rampResults) {
    console.log('  │ ' + String(r.totalReqs).padEnd(9) + '│ ' + (r.ok + '/' + r.totalReqs).padEnd(9) + '│ ' +
      String(r.http429).padEnd(9) + '│ ' + String(r.http5xx).padEnd(9) + '│ ' +
      (r.ttfb.avg + 'ms').padEnd(9) + '│ ' + (r.total.avg + 'ms').padEnd(10) + '│');
  }
  console.log('  └──────────┴──────────┴──────────┴──────────┴──────────┴───────────┘');

  const breakWave = rampResults.find(r => r.fail > 0);
  const lastGood = [...rampResults].reverse().find(r => r.fail === 0);
  console.log('');
  if (breakWave) {
    console.log('  BREAKING POINT: ' + breakWave.totalReqs + ' concurrent (' + Math.round(breakWave.fail/breakWave.totalReqs*100) + '% failure)');
    if (lastGood) console.log('  MAX SAFE LOAD:  ' + lastGood.totalReqs + ' concurrent (100% success)');
  } else {
    console.log('  NO BREAKING POINT — all waves succeeded up to ' + rampResults[rampResults.length-1].totalReqs);
  }

  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────────────┐');
  console.log('  │                   RATE LIMIT RESULTS                             │');
  console.log('  ├──────────────────────────────────────────────────────────────────┤');
  row('│ Q&A (Gemini 2.5 Flash):', qaOk + '/' + qaRateResults.length + ' OK, ' + qa429 + ' rate-limited, RPM=' + Math.round(qaOk/(qaElapsed/60000)));
  row('│ Screen (Flash-Lite):', scOk + '/' + scRateResults.length + ' OK, ' + sc429 + ' rate-limited, RPM=' + Math.round(scOk/(scElapsed/60000)));
  console.log('  └──────────────────────────────────────────────────────────────────┘');

  console.log('');
  console.log('  Completed at ' + new Date().toISOString());
  console.log('');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
