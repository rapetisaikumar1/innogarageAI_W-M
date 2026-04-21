/**
 * Comprehensive Performance & Load Test — 20 Users + Regressive Scaling + Rate Limit Discovery
 * 
 * Tests:
 *   1. 20 concurrent session inits
 *   2. 20 concurrent Q&A SSE streams
 *   3. 20 concurrent screen analyses
 *   4. Mixed load: 20 Q&A + 20 screen = 40 concurrent requests
 *   5. Regressive ramp-up: 20 → 40 → 60 → 80 concurrent Q&A to find breaking point
 *   6. Rate limit discovery: rapid-fire sequential requests from single user
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

const QS_ROUND1 = [
  'What is a closure in JavaScript?',
  'Explain React virtual DOM briefly.',
  'SQL vs NoSQL differences?',
  'How does garbage collection work in Java?',
  'Explain microservices architecture.',
  'What is a binary search tree?',
  'Explain the CAP theorem.',
  'How does HTTPS encryption work?',
  'What are design patterns?',
  'Explain event-driven architecture.',
  'What is a hash table and how does it work?',
  'Explain the difference between TCP and UDP.',
  'What is dependency injection?',
  'How does OAuth2 authentication flow work?',
  'Explain the SOLID principles.',
  'What is a RESTful API?',
  'Describe the MVC pattern.',
  'How does a CDN work?',
  'What is WebSocket and when to use it?',
  'Explain containerization with Docker.'
];

const QS_ROUND2 = [
  'How would you implement a LRU cache?',
  'Explain the observer pattern.',
  'What is database indexing and why is it important?',
  'Describe the difference between threads and processes.',
  'What is a message queue and when would you use one?',
  'Explain Big O notation with examples.',
  'How does DNS resolution work?',
  'What is containerization vs virtualization?',
  'Explain ACID properties in databases.',
  'What is a load balancer and how does it work?',
  'How does React reconciliation work?',
  'What is eventual consistency?',
  'Explain pub/sub messaging pattern.',
  'What is a reverse proxy?',
  'Describe the circuit breaker pattern.',
  'How do database transactions work?',
  'What is GraphQL vs REST?',
  'Explain serverless architecture.',
  'What are microservices anti-patterns?',
  'How does a B-tree index work?'
];

const QS_ROUND3 = [
  'Explain the Raft consensus algorithm.',
  'What is CRDTs in distributed systems?',
  'How does React Fiber work?',
  'Explain the saga pattern for distributed transactions.',
  'What is a bloom filter?',
  'Describe vector clocks in distributed systems.',
  'How does connection pooling work?',
  'Explain the sidecar pattern.',
  'What is event sourcing?',
  'Describe consistent hashing.',
  'What is the actor model in concurrency?',
  'How does memory-mapped I/O work?',
  'Explain the bulkhead pattern.',
  'What is a skip list?',
  'Describe the strangler fig pattern.',
  'How does gRPC compare to REST?',
  'What is a trie data structure?',
  'Explain optimistic vs pessimistic locking.',
  'What is the outbox pattern?',
  'Describe the hexagonal architecture.'
];

const QS_ROUND4 = [
  'How does a JIT compiler work?',
  'What is cooperative multitasking?',
  'Explain lock-free data structures.',
  'What is a Merkle tree?',
  'Describe the leader election problem.',
  'How does memoization optimize performance?',
  'What is the two-phase commit protocol?',
  'Explain blue-green deployment.',
  'What is a Fenwick tree?',
  'Describe eventual vs strong consistency tradeoffs.',
  'How does WebAssembly work?',
  'What is the reactor pattern?',
  'Explain zero-copy networking.',
  'What is a Raft log?',
  'Describe the CQRS pattern.',
  'How does TLS handshake work?',
  'What is a persistent data structure?',
  'Explain the gossip protocol.',
  'What is operational transformation?',
  'Describe the half-open connection pattern.'
];

// ── Helpers ──────────────────────────────────────────
function hdr(text) {
  const w = 76;
  console.log('\n' + '='.repeat(w));
  console.log(' '.repeat(Math.max(0, Math.floor((w - text.length) / 2))) + text);
  console.log('='.repeat(w));
}
function row(label, value) { console.log('  ' + label.padEnd(36) + value); }

async function post(path, token, body) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body)
  });
}

// Minimal valid JPEG for screen analysis
const JPEG_B64 = Buffer.from([
  0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,
  0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,
  0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
  0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,
  0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,
  0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,
  0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,
  0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,
  0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,
  0x00,0x7B,0x94,0x11,0x00,0x00,0x00,0x00,0xFF,0xD9
]).toString('base64');

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
  return { label, ttfb, total, chunks, chars: answer.length, words, wps: total > 0 ? Math.round(words / (total / 1000)) : 0, status: 200 };
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
  return {
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    min: vals[0],
    max: vals[vals.length - 1],
    p50: vals[Math.floor(vals.length * 0.5)],
    p95: vals[Math.floor(vals.length * 0.95)]
  };
}

function printQATable(results) {
  console.log('  ' + '-'.repeat(72));
  console.log('  ' + 'User'.padEnd(6) + 'TTFB'.padEnd(10) + 'Total'.padEnd(10) + 'Chunks'.padEnd(9) + 'Chars'.padEnd(8) + 'Words'.padEnd(8) + 'W/s'.padEnd(8) + 'Status');
  console.log('  ' + '-'.repeat(72));
  results.forEach(r => {
    if (r.error) {
      console.log('  ' + r.label.padEnd(6) + ('ERR: ' + r.error).slice(0, 66));
    } else {
      console.log('  ' + r.label.padEnd(6) + (r.ttfb + 'ms').padEnd(10) + (r.total + 'ms').padEnd(10) +
        String(r.chunks).padEnd(9) + String(r.chars).padEnd(8) + String(r.words).padEnd(8) +
        String(r.wps).padEnd(8) + 'OK');
    }
  });
  console.log('  ' + '-'.repeat(72));
}

function printScreenTable(results) {
  console.log('  ' + '-'.repeat(54));
  console.log('  ' + 'User'.padEnd(6) + 'TTFB'.padEnd(10) + 'Total'.padEnd(10) + 'HTTP'.padEnd(7) + 'Detect'.padEnd(9) + 'Status');
  console.log('  ' + '-'.repeat(54));
  results.forEach(r => {
    if (r.error && !r.status) {
      console.log('  ' + r.label.padEnd(6) + ('ERR: ' + r.error).slice(0, 48));
    } else {
      console.log('  ' + r.label.padEnd(6) + ((r.ttfb||0) + 'ms').padEnd(10) + (r.total + 'ms').padEnd(10) +
        String(r.status).padEnd(7) + String(r.detected ?? 'err').padEnd(9) +
        (r.status === 200 ? 'OK' : 'ERR'));
    }
  });
  console.log('  ' + '-'.repeat(54));
}

function printQAStats(results, n) {
  const ok = results.filter(r => !r.error);
  const s = { ttfb: stats(results, 'ttfb'), total: stats(results, 'total'), wps: stats(results, 'wps') };
  row('Success:', ok.length + '/' + n);
  row('TTFB avg|p50|p95|max:', s.ttfb.avg + '|' + s.ttfb.p50 + '|' + s.ttfb.p95 + '|' + s.ttfb.max + ' ms');
  row('Total avg|p50|p95|max:', s.total.avg + '|' + s.total.p50 + '|' + s.total.p95 + '|' + s.total.max + ' ms');
  row('Throughput avg|min|max:', s.wps.avg + '|' + s.wps.min + '|' + s.wps.max + ' w/s');
  return { ok: ok.length, fail: n - ok.length, ...s };
}

// Track all results for grand summary
const RESULTS = {};

async function main() {
  console.log('');
  console.log('############################################################################');
  console.log('#   INNOGARAGE.AI — COMPREHENSIVE LOAD TEST (20 USERS + REGRESSIVE)        #');
  console.log('#   Server: ' + BASE.padEnd(63) + '#');
  console.log('#   Time:   ' + new Date().toISOString().padEnd(63) + '#');
  console.log('#   Users:  20 concurrent                                                   #');
  console.log('############################################################################');

  // ════════════════════════════════════════════════════════════════════════
  // TEST 1: 20 Concurrent Session Starts
  // ════════════════════════════════════════════════════════════════════════
  hdr('TEST 1: Session Init — 20 users concurrent');

  const t1 = Date.now();
  const starts = await Promise.all(TOKENS.map(async (tok, i) => {
    const t = Date.now();
    const r = await post('/interview/start', tok, {});
    const b = await r.json();
    return { i: i + 1, ms: Date.now() - t, ok: r.status === 200, msg: b.message || b.error };
  }));
  const t1wall = Date.now() - t1;

  const sOk = starts.filter(s => s.ok);
  starts.forEach(s => {
    const tag = s.ok ? 'OK' : 'FAIL';
    process.stdout.write('  U' + String(s.i).padStart(2, '0') + ': ' + s.ms + 'ms [' + tag + ']  ');
    if (s.i % 5 === 0) console.log('');
  });
  console.log('');
  const sAvg = Math.round(starts.reduce((a, s) => a + s.ms, 0) / N);
  row('Success:', sOk.length + '/' + N);
  row('Avg init time:', sAvg + 'ms');
  row('Min / Max:', Math.min(...starts.map(s => s.ms)) + 'ms / ' + Math.max(...starts.map(s => s.ms)) + 'ms');
  row('Wall-clock (parallel):', t1wall + 'ms');
  row('Concurrency savings:', Math.round((1 - t1wall / (sAvg * N)) * 100) + '%');
  starts.filter(s => !s.ok).forEach(s => console.log('  FAILED U' + s.i + ': ' + s.msg));
  RESULTS.init = { success: sOk.length, avg: sAvg, wall: t1wall };

  // ════════════════════════════════════════════════════════════════════════
  // TEST 2: 20 Concurrent Q&A SSE Streams
  // ════════════════════════════════════════════════════════════════════════
  hdr('TEST 2: Q&A Pipeline — 20 concurrent SSE streams');

  const t2 = Date.now();
  const qa = await Promise.all(TOKENS.map((tok, i) => testQA(i + 1, tok, QS_ROUND1[i])));
  const t2wall = Date.now() - t2;

  printQATable(qa);
  console.log('');
  const qa20 = printQAStats(qa, N);
  row('Wall-clock (parallel):', t2wall + 'ms');
  RESULTS.qa20 = { ...qa20, wall: t2wall };

  // ════════════════════════════════════════════════════════════════════════
  // TEST 3: 20 Concurrent Screen Analyses
  // ════════════════════════════════════════════════════════════════════════
  hdr('TEST 3: Screen Analysis — 20 concurrent requests');

  const t3 = Date.now();
  const sc = await Promise.all(TOKENS.map((tok, i) => testScreen(i + 1, tok)));
  const t3wall = Date.now() - t3;

  printScreenTable(sc);
  const scOk = sc.filter(r => r.status === 200);
  const scT = stats(scOk, 'total');
  console.log('');
  row('Success:', scOk.length + '/' + N);
  row('Total avg|p50|p95|max:', scT.avg + '|' + scT.p50 + '|' + scT.p95 + '|' + scT.max + ' ms');
  row('Wall-clock (parallel):', t3wall + 'ms');
  RESULTS.screen20 = { success: scOk.length, ...scT, wall: t3wall };

  // ════════════════════════════════════════════════════════════════════════
  // TEST 4: Mixed Load — 20 Q&A + 20 Screen = 40 Concurrent
  // ════════════════════════════════════════════════════════════════════════
  hdr('TEST 4: Mixed Load — 20 Q&A + 20 Screen (40 concurrent)');

  const t4 = Date.now();
  const mixed = await Promise.all([
    ...TOKENS.map((tok, i) => testQA(i + 1, tok, QS_ROUND2[i])),
    ...TOKENS.map((tok, i) => testScreen(i + 1, tok))
  ]);
  const t4wall = Date.now() - t4;

  const mQA = mixed.slice(0, N);
  const mSC = mixed.slice(N);
  const mQAok = mQA.filter(r => !r.error);
  const mSCok = mSC.filter(r => r.status === 200);

  console.log('  Q&A streams (20):');
  mQA.forEach(r => {
    if (r.error) console.log('    ' + r.label + ': ERR — ' + r.error.slice(0, 50));
    else console.log('    ' + r.label + ': TTFB=' + r.ttfb + 'ms Total=' + r.total + 'ms ' + r.words + 'w ' + r.wps + 'w/s');
  });
  console.log('');
  console.log('  Screen Analysis (20):');
  mSC.forEach(r => {
    if (r.error && !r.status) console.log('    ' + r.label + ': ERR — ' + r.error.slice(0, 50));
    else console.log('    ' + r.label + ': ' + r.total + 'ms HTTP=' + r.status + ' det=' + r.detected);
  });

  const mQAttfb = stats(mQA, 'ttfb');
  const mQAtot = stats(mQA, 'total');
  const mSCtot = stats(mSCok, 'total');
  console.log('');
  row('Q&A success:', mQAok.length + '/' + N);
  row('Q&A TTFB avg|p95:', mQAttfb.avg + '|' + mQAttfb.p95 + ' ms');
  row('Q&A total avg|p95:', mQAtot.avg + '|' + mQAtot.p95 + ' ms');
  row('Screen success:', mSCok.length + '/' + N);
  row('Screen total avg|p95:', mSCtot.avg + '|' + mSCtot.p95 + ' ms');
  row('Wall-clock (40 reqs):', t4wall + 'ms');
  RESULTS.mixed40 = { qaOk: mQAok.length, qaFail: N - mQAok.length, qaTTFB: mQAttfb.avg, qaTotal: mQAtot.avg, scOk: mSCok.length, scTotal: mSCtot.avg, wall: t4wall };

  // ════════════════════════════════════════════════════════════════════════
  // TEST 5: REGRESSIVE RAMP-UP — Find Breaking Point
  // 20 → 40 → 60 → 80 concurrent Q&A requests
  // Uses same 20 users but multiplies requests per user
  // ════════════════════════════════════════════════════════════════════════
  hdr('TEST 5: REGRESSIVE RAMP-UP — Finding Breaking Point');
  console.log('  Strategy: Multiply requests per user to push beyond 20 concurrent');
  console.log('  20 users × 1,2,3,4 requests each = 20,40,60,80 concurrent Q&A');
  console.log('');

  const questionPools = [QS_ROUND1, QS_ROUND2, QS_ROUND3, QS_ROUND4];
  const rampResults = [];

  async function resetAllSessions() {
    // End all sessions, wait, then re-start them
    await Promise.all(TOKENS.map(t => post('/interview/end', t, {}).catch(() => {})));
    await new Promise(r => setTimeout(r, 1000));
    const starts = await Promise.all(TOKENS.map(async (tok) => {
      const r = await post('/interview/start', tok, {});
      return r.status === 200;
    }));
    const ok = starts.filter(Boolean).length;
    console.log('  [Session reset: ' + ok + '/' + N + ' sessions re-initialized]');
    await new Promise(r => setTimeout(r, 500));
    return ok;
  }

  for (const multiplier of [1, 2, 3, 4]) {
    const totalReqs = N * multiplier;
    const subtitle = totalReqs + ' concurrent Q&A (' + N + ' users × ' + multiplier + ' each)';
    console.log('  ── Wave ' + multiplier + ': ' + subtitle + ' ──');

    // Re-init sessions before each wave to ensure clean state
    if (multiplier > 1) {
      const sessOk = await resetAllSessions();
      if (sessOk < N) {
        console.log('  ⚠ Only ' + sessOk + '/' + N + ' sessions initialized — proceeding anyway');
      }
    }

    // Build request array: each user gets `multiplier` requests
    const requests = [];
    for (let m = 0; m < multiplier; m++) {
      for (let u = 0; u < N; u++) {
        requests.push({ userIdx: u, question: questionPools[m][u] });
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

    row('  Requests:', totalReqs + ' concurrent');
    row('  Success:', ok.length + '/' + totalReqs + ' (' + Math.round(ok.length / totalReqs * 100) + '%)');
    if (http429.length) row('  Rate limited (429):', http429.length + ' requests');
    if (http500.length) row('  Server errors (5xx):', http500.length + ' requests');
    if (fail.length > 0 && fail.length <= 5) {
      fail.forEach(r => console.log('    Error: ' + r.label + ' — ' + (r.error || '').slice(0, 60)));
    } else if (fail.length > 5) {
      console.log('    First 5 errors:');
      fail.slice(0, 5).forEach(r => console.log('      ' + r.label + ' — ' + (r.error || '').slice(0, 55)));
    }
    row('  TTFB avg|p50|p95|max:', ttfbS.avg + '|' + ttfbS.p50 + '|' + ttfbS.p95 + '|' + ttfbS.max + ' ms');
    row('  Total avg|p50|p95|max:', totalS.avg + '|' + totalS.p50 + '|' + totalS.p95 + '|' + totalS.max + ' ms');
    row('  Throughput avg:', wpsS.avg + ' w/s');
    row('  Wall-clock:', wall + 'ms');
    console.log('');

    rampResults.push({ totalReqs, ok: ok.length, fail: fail.length, http429: http429.length, http5xx: http500.length, ttfb: ttfbS, total: totalS, wps: wpsS, wall });

    // If failure rate exceeds 50%, stop ramping
    if (fail.length > totalReqs * 0.5) {
      console.log('  ⚠ Failure rate > 50% — stopping ramp-up at ' + totalReqs + ' concurrent.');
      break;
    }

    // Brief pause between waves to let server stabilize
    if (multiplier < 4) {
      console.log('  Cooling down 3s before next wave...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  RESULTS.ramp = rampResults;

  // ════════════════════════════════════════════════════════════════════════
  // TEST 6: RATE LIMIT DISCOVERY — Rapid-Fire from Single User
  // Send sequential requests as fast as possible to trigger 429
  // ════════════════════════════════════════════════════════════════════════
  hdr('TEST 6: RATE LIMIT DISCOVERY — Rapid-Fire Sequential');
  console.log('  Strategy: Send requests back-to-back from User 1 to find RPM limits');
  console.log('  Testing both Q&A (Gemini 2.5 Flash) and Screen (Gemini 2.5 Flash-Lite)');
  console.log('');

  // Re-init session for User 1 before rate limit testing
  console.log('  Re-initializing User 1 session for rate limit tests...');
  await post('/interview/end', TOKENS[0], {}).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  const rlInitRes = await post('/interview/start', TOKENS[0], {});
  console.log('  Session init: HTTP ' + rlInitRes.status);
  console.log('');

  // 6A: Q&A Rate Limit Test (short questions for fast turnaround)
  console.log('  ── 6A: Q&A Rapid-Fire (target: 30 requests in 60s) ──');
  const shortQuestions = [
    'What is a variable?', 'What is a function?', 'What is a loop?',
    'What is an array?', 'What is a string?', 'What is an object?',
    'What is a class?', 'What is a method?', 'What is inheritance?',
    'What is polymorphism?', 'What is an interface?', 'What is abstraction?',
    'What is a pointer?', 'What is a stack?', 'What is a queue?',
    'What is a set?', 'What is a map?', 'What is a graph?',
    'What is a tree?', 'What is a node?', 'What is recursion?',
    'What is iteration?', 'What is a callback?', 'What is a promise?',
    'What is async/await?', 'What is a closure?', 'What is scope?',
    'What is hoisting?', 'What is a prototype?', 'What is this keyword?'
  ];

  const qaRateResults = [];
  const qaRateStart = Date.now();
  const qaRateTimeout = 90000; // 90s max
  let qaRate429Count = 0;
  let qaRateErrorCount = 0;

  for (let i = 0; i < shortQuestions.length; i++) {
    if (Date.now() - qaRateStart > qaRateTimeout) {
      console.log('    Timeout at request ' + (i + 1));
      break;
    }
    const t0 = Date.now();
    const r = await testQA(1, TOKENS[0], shortQuestions[i]);
    const elapsed = Date.now() - qaRateStart;
    const rpm = Math.round((i + 1) / (elapsed / 60000));

    if (r.error) {
      qaRateErrorCount++;
      if (r.status === 429) qaRate429Count++;
      process.stdout.write('    #' + String(i + 1).padStart(2) + ' ' + (Date.now() - t0) + 'ms ERR[' + (r.status || 'net') + '] elapsed=' + Math.round(elapsed / 1000) + 's rpm~' + rpm + '\n');
    } else {
      process.stdout.write('    #' + String(i + 1).padStart(2) + ' TTFB=' + r.ttfb + 'ms total=' + r.total + 'ms ' + r.words + 'w elapsed=' + Math.round(elapsed / 1000) + 's rpm~' + rpm + '\n');
    }
    qaRateResults.push({ ...r, elapsedMs: elapsed, calcRPM: rpm });
  }

  const qaRateElapsed = Date.now() - qaRateStart;
  const qaRateOk = qaRateResults.filter(r => !r.error);
  console.log('');
  row('  Completed:', qaRateResults.length + ' requests in ' + Math.round(qaRateElapsed / 1000) + 's');
  row('  Success:', qaRateOk.length + '/' + qaRateResults.length);
  row('  Rate limited (429):', qaRate429Count + ' requests');
  row('  Other errors:', (qaRateErrorCount - qaRate429Count) + ' requests');
  row('  Effective RPM:', Math.round(qaRateOk.length / (qaRateElapsed / 60000)) + ' successful req/min');
  row('  Avg TTFB:', stats(qaRateResults, 'ttfb').avg + 'ms');
  RESULTS.rateLimitQA = { total: qaRateResults.length, ok: qaRateOk.length, rate429: qaRate429Count, errors: qaRateErrorCount, elapsedMs: qaRateElapsed, effectiveRPM: Math.round(qaRateOk.length / (qaRateElapsed / 60000)) };

  // Brief pause
  await new Promise(r => setTimeout(r, 2000));

  // 6B: Screen Analysis Rate Limit Test
  console.log('  ── 6B: Screen Analysis Rapid-Fire (target: 30 requests) ──');
  const scRateResults = [];
  const scRateStart = Date.now();
  let scRate429Count = 0;
  let scRateErrorCount = 0;

  for (let i = 0; i < 30; i++) {
    if (Date.now() - scRateStart > qaRateTimeout) {
      console.log('    Timeout at request ' + (i + 1));
      break;
    }
    const t0 = Date.now();
    const r = await testScreen(1, TOKENS[0]);
    const elapsed = Date.now() - scRateStart;
    const rpm = Math.round((i + 1) / (elapsed / 60000));

    if (r.status === 429) scRate429Count++;
    if (r.error || r.status !== 200) scRateErrorCount++;

    process.stdout.write('    #' + String(i + 1).padStart(2) + ' ' + r.total + 'ms HTTP=' + (r.status || 'ERR') + ' elapsed=' + Math.round(elapsed / 1000) + 's rpm~' + rpm + '\n');
    scRateResults.push({ ...r, elapsedMs: elapsed, calcRPM: rpm });
  }

  const scRateElapsed = Date.now() - scRateStart;
  const scRateOk = scRateResults.filter(r => r.status === 200);
  console.log('');
  row('  Completed:', scRateResults.length + ' requests in ' + Math.round(scRateElapsed / 1000) + 's');
  row('  Success:', scRateOk.length + '/' + scRateResults.length);
  row('  Rate limited (429):', scRate429Count + ' requests');
  row('  Other errors:', (scRateErrorCount - scRate429Count) + ' requests');
  row('  Effective RPM:', Math.round(scRateOk.length / (scRateElapsed / 60000)) + ' successful req/min');
  RESULTS.rateLimitScreen = { total: scRateResults.length, ok: scRateOk.length, rate429: scRate429Count, errors: scRateErrorCount, elapsedMs: scRateElapsed, effectiveRPM: Math.round(scRateOk.length / (scRateElapsed / 60000)) };

  // ── Cleanup ─────────────────────────────────────────
  hdr('CLEANUP');
  await Promise.all(TOKENS.map(t => post('/interview/end', t, {})));
  console.log('  All 20 sessions ended.');

  // ════════════════════════════════════════════════════════════════════════
  // GRAND SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  hdr('GRAND PERFORMANCE SUMMARY');
  console.log('');

  console.log('  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │                    BASELINE: 20 CONCURRENT USERS                    │');
  console.log('  ├─────────────────────────────────────────────────────────────────────┤');
  row('│ Session Init (avg):', RESULTS.init.avg + 'ms   Success: ' + RESULTS.init.success + '/' + N);
  row('│ Q&A TTFB (avg|p95):', RESULTS.qa20.ttfb.avg + '|' + RESULTS.qa20.ttfb.p95 + ' ms');
  row('│ Q&A Total (avg|p95):', RESULTS.qa20.total.avg + '|' + RESULTS.qa20.total.p95 + ' ms');
  row('│ Q&A Throughput (avg):', RESULTS.qa20.wps.avg + ' words/sec');
  row('│ Q&A Success:', RESULTS.qa20.ok + '/' + N);
  row('│ Screen Analysis (avg|p95):', RESULTS.screen20.avg + '|' + RESULTS.screen20.p95 + ' ms');
  row('│ Screen Success:', RESULTS.screen20.success + '/' + N);
  row('│ Mixed Load Q&A TTFB:', RESULTS.mixed40.qaTTFB + 'ms');
  row('│ Mixed Load Screen:', RESULTS.mixed40.scTotal + 'ms');
  console.log('  └─────────────────────────────────────────────────────────────────────┘');
  console.log('');

  console.log('  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │                    SCALING: ACROSS ALL USER COUNTS                  │');
  console.log('  ├──────────────┬──────────┬──────────┬──────────┬─────────────────────┤');
  console.log('  │ Metric       │ 2 users  │ 5 users  │ 10 users │ 20 users            │');
  console.log('  ├──────────────┼──────────┼──────────┼──────────┼─────────────────────┤');
  console.log('  │ Q&A TTFB avg │ 419ms    │ 401ms    │ 373ms    │ ' + String(RESULTS.qa20.ttfb.avg + 'ms').padEnd(20) + '│');
  console.log('  │ Q&A total avg│ 2863ms   │ 2398ms   │ 2887ms   │ ' + String(RESULTS.qa20.total.avg + 'ms').padEnd(20) + '│');
  console.log('  │ Q&A w/s      │ 57       │ 58       │ 60       │ ' + String(RESULTS.qa20.wps.avg).padEnd(20) + '│');
  console.log('  │ Screen avg   │ 5004ms   │ 1619ms   │ 1640ms   │ ' + String(RESULTS.screen20.avg + 'ms').padEnd(20) + '│');
  console.log('  │ Init avg     │ 1042ms   │ 1161ms   │ 978ms    │ ' + String(RESULTS.init.avg + 'ms').padEnd(20) + '│');
  console.log('  └──────────────┴──────────┴──────────┴──────────┴─────────────────────┘');
  console.log('');

  console.log('  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │                    REGRESSIVE RAMP-UP RESULTS                       │');
  console.log('  ├──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┤');
  console.log('  │ Reqs     │ Success  │ 429s     │ 5xx      │ TTFB avg │ Total avg    │');
  console.log('  ├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤');
  for (const r of RESULTS.ramp) {
    console.log('  │ ' + String(r.totalReqs).padEnd(9) + '│ ' + (r.ok + '/' + r.totalReqs).padEnd(9) + '│ ' +
      String(r.http429).padEnd(9) + '│ ' + String(r.http5xx).padEnd(9) + '│ ' +
      (r.ttfb.avg + 'ms').padEnd(9) + '│ ' + (r.total.avg + 'ms').padEnd(13) + '│');
  }
  console.log('  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────────┘');
  console.log('');

  // Determine breaking point
  const breakingWave = RESULTS.ramp.find(r => r.fail > 0);
  if (breakingWave) {
    console.log('  BREAKING POINT: First failures at ' + breakingWave.totalReqs + ' concurrent requests');
    console.log('  Failure rate: ' + Math.round(breakingWave.fail / breakingWave.totalReqs * 100) + '% (' + breakingWave.fail + ' failed)');
    if (breakingWave.http429 > 0) console.log('  Rate-limited (429): ' + breakingWave.http429 + ' requests');
    if (breakingWave.http5xx > 0) console.log('  Server errors (5xx): ' + breakingWave.http5xx + ' requests');
  } else {
    console.log('  NO BREAKING POINT FOUND — all ramp-up waves succeeded!');
    console.log('  App handled up to ' + RESULTS.ramp[RESULTS.ramp.length - 1].totalReqs + ' concurrent requests without failures.');
  }
  console.log('');

  console.log('  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │                    RATE LIMIT DISCOVERY                             │');
  console.log('  ├─────────────────────────────────────────────────────────────────────┤');
  const rlQA = RESULTS.rateLimitQA;
  const rlSC = RESULTS.rateLimitScreen;
  row('│ Q&A (Gemini 2.5 Flash):', '');
  row('│   Requests sent:', rlQA.total + ' in ' + Math.round(rlQA.elapsedMs / 1000) + 's');
  row('│   Successful:', rlQA.ok + '/' + rlQA.total);
  row('│   Rate limited (429):', rlQA.rate429 + ' requests');
  row('│   Effective RPM:', rlQA.effectiveRPM + ' req/min');
  row('│ Screen (Gemini 2.5 Flash-Lite):', '');
  row('│   Requests sent:', rlSC.total + ' in ' + Math.round(rlSC.elapsedMs / 1000) + 's');
  row('│   Successful:', rlSC.ok + '/' + rlSC.total);
  row('│   Rate limited (429):', rlSC.rate429 + ' requests');
  row('│   Effective RPM:', rlSC.effectiveRPM + ' req/min');
  console.log('  └─────────────────────────────────────────────────────────────────────┘');
  console.log('');

  if (rlQA.rate429 > 0 || rlSC.rate429 > 0) {
    console.log('  RATE LIMIT DETECTED:');
    if (rlQA.rate429 > 0) console.log('    Gemini 2.5 Flash: Hit 429 after ~' + (rlQA.ok) + ' requests (' + rlQA.effectiveRPM + ' effective RPM)');
    if (rlSC.rate429 > 0) console.log('    Gemini 2.5 Flash-Lite: Hit 429 after ~' + (rlSC.ok) + ' requests (' + rlSC.effectiveRPM + ' effective RPM)');
  } else {
    console.log('  NO RATE LIMITS HIT — both models handled all rapid-fire requests.');
    console.log('  Observed RPM: Q&A=' + rlQA.effectiveRPM + ', Screen=' + rlSC.effectiveRPM);
  }

  console.log('');
  console.log('  Test completed at ' + new Date().toISOString());
  console.log('');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
