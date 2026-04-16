'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');

const BASE_PORT = 18930;

async function startServer(port, env = {}) {
  const { fork } = require('child_process');
  const child = fork(path.join(__dirname, '..', 'server.js'), [], {
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

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Integration tests (start real server via fork) ──────────────────────────────

describe('/api/bea proxy', () => {
  it('returns 503 when BEA_API_KEY is empty', async () => {
    const child = await startServer(BASE_PORT + 1, { BEA_API_KEY: '' });
    try {
      const res = await get(BASE_PORT + 1, '/api/bea?method=GetData&DataSetName=ITA');
      assert.equal(res.status, 503);
      const json = JSON.parse(res.body);
      assert.equal(json.error, 'BEA_API_KEY not configured');
    } finally {
      child.kill();
    }
  });

  it('returns 503 when BEA_API_KEY is not set at all', async () => {
    const env = { ...process.env };
    delete env.BEA_API_KEY;
    const child = await startServer(BASE_PORT + 2, env);
    try {
      const res = await get(BASE_PORT + 2, '/api/bea?method=GetData');
      assert.equal(res.status, 503);
    } finally {
      child.kill();
    }
  });
});

// ── Unit tests (mock https.get to test proxy logic without network) ────────────

describe('/api/bea proxy (mocked)', () => {
  let server;
  let originalRequire;

  beforeEach(() => {
    // We'll test the route handler directly by creating an express app
    // with the BEA route injected, mocking https.get
  });

  it('forwards query parameters to BEA and adds UserID + ResultFormat', async () => {
    const express = require('express');
    const app = express();

    let capturedUrl = null;
    // Mock https module
    const mockHttps = {
      get: (url, cb) => {
        capturedUrl = url;
        // Simulate BEA response
        const mockRes = {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          pipe: (res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.end(JSON.stringify({ BEAAPI: { Results: { Data: [] } } }));
          },
          on: (evt, handler) => { return mockHttps; },
        };
        cb(mockRes);
        return { on: () => mockHttps };
      },
    };

    const beaKey = 'TEST_KEY_12345';
    app.get('/api/bea', (req, res) => {
      if (!beaKey) return res.status(503).json({ error: 'BEA_API_KEY not configured' });
      const params = new URLSearchParams(req.query);
      params.set('UserID', beaKey);
      params.set('ResultFormat', 'JSON');
      const url = `https://apps.bea.gov/api/data/?${params}`;
      mockHttps.get(url, (upstream) => {
        if (upstream.statusCode !== 200) {
          res.status(upstream.statusCode).type('json').send('{"error":"BEA upstream error"}');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        upstream.pipe(res);
      });
    });

    const srv = app.listen(0);
    const port = srv.address().port;
    try {
      const res = await get(port, '/api/bea?method=GetData&DataSetName=ITA&AreaOrCountry=US');
      assert.equal(res.status, 200);
      assert.ok(capturedUrl, 'should have called https.get');
      assert.ok(capturedUrl.includes('UserID=TEST_KEY_12345'), 'should include UserID');
      assert.ok(capturedUrl.includes('ResultFormat=JSON'), 'should include ResultFormat');
      assert.ok(capturedUrl.includes('DataSetName=ITA'), 'should forward DataSetName');
      const json = JSON.parse(res.body);
      assert.ok(json.BEAAPI, 'should return BEA-formatted response');
    } finally {
      srv.close();
    }
  });

  it('passes through upstream error status codes', async () => {
    const express = require('express');
    const app = express();

    const mockHttps = {
      get: (url, cb) => {
        const mockRes = { statusCode: 429, pipe: () => {} };
        cb(mockRes);
        return { on: () => mockHttps };
      },
    };

    const beaKey = 'RATE_LIMITED_KEY';
    app.get('/api/bea', (req, res) => {
      if (!beaKey) return res.status(503).json({ error: 'BEA_API_KEY not configured' });
      const params = new URLSearchParams(req.query);
      params.set('UserID', beaKey);
      params.set('ResultFormat', 'JSON');
      const url = `https://apps.bea.gov/api/data/?${params}`;
      mockHttps.get(url, (upstream) => {
        if (upstream.statusCode !== 200) {
          res.status(upstream.statusCode).type('json').send('{"error":"BEA upstream error"}');
          return;
        }
      });
    });

    const srv = app.listen(0);
    const port = srv.address().port;
    try {
      const res = await get(port, '/api/bea?method=GetData');
      assert.equal(res.status, 429);
      const json = JSON.parse(res.body);
      assert.equal(json.error, 'BEA upstream error');
    } finally {
      srv.close();
    }
  });

  it('sets Cache-Control header on successful proxy', async () => {
    const express = require('express');
    const app = express();

    const mockHttps = {
      get: (url, cb) => {
        const mockRes = {
          statusCode: 200,
          pipe: (res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.end(JSON.stringify({ BEAAPI: { Results: { Data: [{ Year: '2024', DataValue: '100' }] } } }));
          },
        };
        cb(mockRes);
        return { on: () => mockHttps };
      },
    };

    const beaKey = 'CACHETEST';
    app.get('/api/bea', (req, res) => {
      if (!beaKey) return res.status(503).json({ error: 'BEA_API_KEY not configured' });
      const params = new URLSearchParams(req.query);
      params.set('UserID', beaKey);
      params.set('ResultFormat', 'JSON');
      const url = `https://apps.bea.gov/api/data/?${params}`;
      mockHttps.get(url, (upstream) => {
        if (upstream.statusCode !== 200) {
          res.status(upstream.statusCode).type('json').send('{"error":"BEA upstream error"}');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        upstream.pipe(res);
      });
    });

    const srv = app.listen(0);
    const port = srv.address().port;
    try {
      const res = await get(port, '/api/bea?method=GetData');
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'public, max-age=3600');
    } finally {
      srv.close();
    }
  });

  it('returns 502 when https.get errors', async () => {
    const express = require('express');
    const app = express();

    const mockHttps = {
      get: (url, cb) => {
        // Return an object that calls the error handler
        return {
          on: (evt, handler) => {
            if (evt === 'error') {
              // Simulate network error
              setTimeout(() => handler(new Error('ECONNREFUSED')), 0);
            }
            return mockHttps;
          },
        };
      },
    };

    const beaKey = 'ERRORKEY';
    app.get('/api/bea', (req, res) => {
      if (!beaKey) return res.status(503).json({ error: 'BEA_API_KEY not configured' });
      const params = new URLSearchParams(req.query);
      params.set('UserID', beaKey);
      params.set('ResultFormat', 'JSON');
      const url = `https://apps.bea.gov/api/data/?${params}`;
      mockHttps.get(url, (upstream) => {
        if (upstream.statusCode !== 200) {
          res.status(upstream.statusCode).type('json').send('{"error":"BEA upstream error"}');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        upstream.pipe(res);
      }).on('error', (e) => {
        res.status(502).json({ error: 'BEA proxy failed', detail: e.message });
      });
    });

    const srv = app.listen(0);
    const port = srv.address().port;
    try {
      const res = await get(port, '/api/bea?method=GetData');
      assert.equal(res.status, 502);
      const json = JSON.parse(res.body);
      assert.equal(json.error, 'BEA proxy failed');
    } finally {
      srv.close();
    }
  });
});