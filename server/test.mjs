import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.mjs';

test('HTTP health, test request, mobile page and errors', async () => {
  const server = createApp().listen(0, '0.0.0.0');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(server.address().address, '0.0.0.0');
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, service: 'memory-river', status: 'running' });
    const response = await fetch(`${base}/api/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'phone' }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, message: '电脑已收到手机发送的测试请求' });
    const page = await fetch(`${base}/test`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /发送测试请求/);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    const malformed = await fetch(`${base}/api/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).ok, false);
    const large = await fetch(`${base}/api/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'a'.repeat(9000) }) });
    assert.equal(large.status, 413);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
