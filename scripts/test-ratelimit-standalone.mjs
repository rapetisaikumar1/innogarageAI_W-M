/**
 * Standalone Rate Limit Discovery Test
 * Waits for server to be healthy, generates fresh session, then rapid-fires
 */

const BASE = 'https://innogarage-ai-production.up.railway.app';

// Use just user 1 for rate limit testing
const TOKEN = process.argv[2]; // Pass fresh token as argument

const JPEG_B64 = Buffer.from([0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0x7B,0x94,0x11,0x00,0x00,0x00,0x00,0xFF,0xD9]).toString('base64');

function row(l, v) { console.log('  ' + l.padEnd(36) + v); }

async function post(path, body) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(body)
  });
}

async function waitForServer() {
  console.log('  Waiting for server to be healthy...');
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE + '/interview/status', {
        headers: { Authorization: 'Bearer ' + TOKEN }
      });
      if (r.status === 200) {
        console.log('  Server is healthy (attempt ' + (i+1) + ')');
        return true;
      }
      console.log('  Attempt ' + (i+1) + ': HTTP ' + r.status);
    } catch (e) {
      console.log('  Attempt ' + (i+1) + ': ' + e.message);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

async function testQA(question) {
  const t0 = Date.now();
  let ttfb = 0, answer = '';
  try {
    const res = await post('/interview/ask', { text: question });
    ttfb = Date.now() - t0;
    if (res.status !== 200) {
      const body = await res.text().catch(() => '');
      return { error: 'HTTP ' + res.status + ' ' + body.slice(0, 80), ttfb, total: Date.now() - t0, status: res.status };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value, { stream: true }).split('\n')) {
        if (line.startsWith('data: ')) {
          const p = line.slice(6).trim();
          if (p === '[DONE]') continue;
          try { answer += JSON.parse(p).text || ''; } catch {}
        }
      }
    }
  } catch (e) { return { error: e.message, total: Date.now() - t0 }; }
  const total = Date.now() - t0;
  const words = answer.split(/\s+/).filter(Boolean).length;
  return { ttfb, total, words, status: 200 };
}

async function testScreen() {
  const t0 = Date.now();
  try {
    const res = await post('/interview/code-suggest', { image: JPEG_B64 });
    const body = await res.json();
    return { total: Date.now() - t0, status: res.status, detected: body.detected };
  } catch (e) { return { error: e.message, total: Date.now() - t0 }; }
}

async function main() {
  if (!TOKEN) {
    console.error('Usage: node test-ratelimit-standalone.mjs <JWT_TOKEN>');
    process.exit(1);
  }

  console.log('');
  console.log('########################################################');
  console.log('#   STANDALONE RATE LIMIT DISCOVERY TEST                #');
  console.log('#   Time: ' + new Date().toISOString().padEnd(43) + '#');
  console.log('########################################################');
  console.log('');

  // Wait for server
  const healthy = await waitForServer();
  if (!healthy) { console.log('  Server never recovered. Aborting.'); process.exit(1); }

  // End any existing session, then start fresh
  await post('/interview/end', {}).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  const initRes = await post('/interview/start', {});
  console.log('  Session init: HTTP ' + initRes.status);
  if (initRes.status !== 200) {
    console.log('  Failed to init session. Aborting.');
    process.exit(1);
  }
  await new Promise(r => setTimeout(r, 500));

  // ═══════════════════════════════════════════════════════════
  // Q&A Rapid-Fire — 30 sequential requests
  // ═══════════════════════════════════════════════════════════
  console.log('');
  console.log('  ══ Q&A Rapid-Fire (Gemini 2.5 Flash) — 30 requests ══');
  const shortQs = [
    'What is a variable?','What is a function?','What is a loop?','What is an array?','What is a string?',
    'What is an object?','What is a class?','What is a method?','What is inheritance?','What is polymorphism?',
    'What is an interface?','What is abstraction?','What is a pointer?','What is a stack?','What is a queue?',
    'What is a set?','What is a map?','What is a graph?','What is a tree?','What is a node?',
    'What is recursion?','What is iteration?','What is a callback?','What is a promise?','What is async/await?',
    'What is a closure?','What is scope?','What is hoisting?','What is a prototype?','What is this keyword?'
  ];

  const qaResults = [];
  const qaStart = Date.now();
  let qa429 = 0;

  for (let i = 0; i < shortQs.length; i++) {
    if (Date.now() - qaStart > 180000) { console.log('    Timeout at 3min'); break; }
    const r = await testQA(shortQs[i]);
    const elapsed = Date.now() - qaStart;
    const rpm = Math.round((i + 1) / (elapsed / 60000));

    if (r.error) {
      if (r.status === 429) qa429++;
      process.stdout.write('    #' + String(i+1).padStart(2) + ' ' + r.total + 'ms ERR[' + (r.status||'net') + '] rpm~' + rpm + '\n');
    } else {
      process.stdout.write('    #' + String(i+1).padStart(2) + ' TTFB=' + r.ttfb + 'ms total=' + r.total + 'ms ' + r.words + 'w rpm~' + rpm + '\n');
    }
    qaResults.push(r);
  }

  const qaElapsed = Date.now() - qaStart;
  const qaOk = qaResults.filter(r => !r.error).length;
  const qaAvgTtfb = qaResults.filter(r => r.ttfb).length > 0
    ? Math.round(qaResults.filter(r => r.ttfb).reduce((a, r) => a + r.ttfb, 0) / qaResults.filter(r => r.ttfb).length)
    : 0;
  console.log('');
  row('Completed:', qaResults.length + ' in ' + Math.round(qaElapsed/1000) + 's');
  row('Success:', qaOk + '/' + qaResults.length);
  row('Rate limited (429):', String(qa429));
  row('Effective RPM:', Math.round(qaOk / (qaElapsed / 60000)) + ' req/min');
  row('Avg TTFB:', qaAvgTtfb + 'ms');

  // ═══════════════════════════════════════════════════════════
  // Screen Analysis Rapid-Fire — 30 sequential requests
  // ═══════════════════════════════════════════════════════════
  await new Promise(r => setTimeout(r, 2000));
  console.log('');
  console.log('  ══ Screen Rapid-Fire (Gemini 2.5 Flash-Lite) — 30 reqs ══');

  const scResults = [];
  const scStart = Date.now();
  let sc429 = 0;

  for (let i = 0; i < 30; i++) {
    if (Date.now() - scStart > 180000) { console.log('    Timeout at 3min'); break; }
    const r = await testScreen();
    const elapsed = Date.now() - scStart;
    const rpm = Math.round((i + 1) / (elapsed / 60000));

    if (r.status === 429) sc429++;
    process.stdout.write('    #' + String(i+1).padStart(2) + ' ' + r.total + 'ms HTTP=' + (r.status||'ERR') + ' rpm~' + rpm + '\n');
    scResults.push(r);
  }

  const scElapsed = Date.now() - scStart;
  const scOk = scResults.filter(r => r.status === 200).length;
  console.log('');
  row('Completed:', scResults.length + ' in ' + Math.round(scElapsed/1000) + 's');
  row('Success:', scOk + '/' + scResults.length);
  row('Rate limited (429):', String(sc429));
  row('Effective RPM:', Math.round(scOk / (scElapsed / 60000)) + ' req/min');

  // Cleanup
  await post('/interview/end', {}).catch(() => {});

  // Summary
  console.log('');
  console.log('  ══════════════════════════════════════════════════════');
  console.log('  RATE LIMIT SUMMARY');
  console.log('  ──────────────────────────────────────────────────────');
  row('Q&A (Gemini 2.5 Flash):', qaOk + '/' + qaResults.length + ' OK, ' + qa429 + ' x 429, RPM=' + Math.round(qaOk/(qaElapsed/60000)));
  row('Screen (Flash-Lite):', scOk + '/' + scResults.length + ' OK, ' + sc429 + ' x 429, RPM=' + Math.round(scOk/(scElapsed/60000)));
  console.log('  ══════════════════════════════════════════════════════');
  console.log('');
  console.log('  Done at ' + new Date().toISOString());
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
