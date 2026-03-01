const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      host: '127.0.0.1',
      port: 3210,
      path,
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      } : {}
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (_) {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const home = await request('GET', '/');
  if (home.status !== 200 || !String(home.body).includes('Arcade Nexus App Center')) {
    throw new Error('Home page did not render Arcade Nexus App Center.');
  }

  const stamp = Date.now();
  const created = await request('POST', '/api/v1/items', {
    name: `Smoke Arcade ${stamp}`, category: 'arcade', rarity: 'rare', power: 77, value: 120
  });
  if (created.status !== 201) throw new Error('Failed to create catalog item');
  const id = created.body.data.id;

  const list = await request('GET', '/api/v1/items?search=smoke%20arcade&size=5');
  if (list.status !== 200 || !Array.isArray(list.body.data)) throw new Error('Failed to list items');

  const patch = await request('PATCH', `/api/v1/items/${id}`, { status: 'review' });
  if (patch.status !== 200) throw new Error('Failed to patch item');

  const telemetry = await request('POST', '/api/v1/telemetry/events', { name: 'smoke_event', properties: { ok: true } });
  if (telemetry.status !== 201) throw new Error('Failed to post telemetry');

  const count = await request('GET', '/api/v1/items/count');
  if (count.status !== 200) throw new Error('Failed to count items');

  const health = await request('GET', '/healthz');
  if (health.status !== 200) throw new Error('Health check failed');

  console.log('Smoke test passed. Created item:', id);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
