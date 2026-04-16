'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const BASE_PORT = 18923;
let _server = null;
let _baseUrl = '';

async function startServer(port, env = {}) {
  const { fork } = require('child_process');
  const child = fork(require('path').join(__dirname, '..', 'server.js'), [], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: 'pipe',
    silent: true,
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server start timeout')), 5000);
    child.on('message', () => {}).on('error', reject);
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    setTimeout(() => { clearTimeout(timeout); resolve(child); }, 500);
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(_baseUrl + path, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

describe('/api/bea proxy', () => {
  it('returns 503 when BEA_API_KEY is not set', async () => {
    const child = await startServer(BASE_PORT + 1, { BEA_API_KEY: '' });
    try {
      const res = await get(`http://127.0.0.1:${BASE_PORT + 1}/api/bea?method=GetData&DataSetName=ITA`);
      assert.equal(res.status, 503);
      const json = JSON.parse(res.body);
      assert.equal(json.error, 'BEA_API_KEY not configured');
    } finally {
      child.kill();
    }
  });
});

describe('/api/fx proxy', () => {
  it('responds to /api/fx (upstream may fail but proxy itself works)', async () => {
    const child = await startServer(BASE_PORT + 2);
    try {
      const res = await get(`http://127.0.0.1:${BASE_PORT + 2}/api/fx`);
      assert.ok(res.status === 200 || res.status === 502, `got ${res.status}`);
    } finally {
      child.kill();
    }
  });
});

describe('static file serving', () => {
  it('serves index.html at /', async () => {
    const child = await startServer(BASE_PORT + 3);
    try {
      const res = await get(`http://127.0.0.1:${BASE_PORT + 3}/`);
      assert.equal(res.status, 200);
      assert.ok(res.body.includes('<html'), 'should be HTML');
    } finally {
      child.kill();
    }
  });
});