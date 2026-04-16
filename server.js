require('dotenv').config();
const express     = require('express');
const compression = require('compression');
const path        = require('path');
const fs          = require('fs');
const os          = require('os');
const https       = require('https');

const app      = express();
const PORT     = process.env.PORT || 0;
const OUT_FILE = path.join(__dirname, 'public', 'cities-full.json');
const START_MS = Date.now();

let _writeLock = Promise.resolve();

// ── Analytics store (in-memory ring buffer, last 1000 requests) ──
const MAX_ANALYTICS = 1000;
const _analytics = {
  requests: [],
  fxProxy: { success: 0, fail: 0, totalMs: 0 },
  enrich: { success: 0, fail: 0 },
  errors: [],
};

function _pushRequest(entry) {
  _analytics.requests.push(entry);
  if (_analytics.requests.length > MAX_ANALYTICS) _analytics.requests.shift();
}
function _pushError(entry) {
  _analytics.errors.push(entry);
  if (_analytics.errors.length > 200) _analytics.errors.shift();
}

app.use(compression());
app.use(express.json({ limit: '64kb' }));

// ── Request tracker middleware ──
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    _pushRequest({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    // Allow browsers to cache large static JSON files for 1 hour
    if (filePath.endsWith('.json')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Proxy Frankfurter FX rates to avoid CORS (follows redirects)
function httpsGet(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const doRequest = (target) => {
      https.get(target, (upstream) => {
        if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
          if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
          upstream.resume();
          doRequest(upstream.headers.location);
        } else {
          resolve(upstream);
        }
      }).on('error', reject);
    };
    doRequest(url);
  });
}

// ── FX proxy ──

const _beaKey = process.env.BEA_API_KEY || '';

app.get('/api/bea', (req, res) => {
  if (!_beaKey) return res.status(503).json({ error: 'BEA_API_KEY not configured' });
  const params = new URLSearchParams(req.query);
  params.set('UserID', _beaKey);
  params.set('ResultFormat', 'JSON');
  const url = `https://apps.bea.gov/api/data/?${params}`;
  const mod = require('https');
  mod.get(url, (upstream) => {
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

app.get('/api/fx', async (req, res) => {
  const date = req.query.date || 'latest';
  const url = `https://api.frankfurter.app/${date}?from=USD`;
  const start = Date.now();
  try {
    const upstream = await httpsGet(url);
    if (upstream.statusCode !== 200) {
      let body = '';
      upstream.on('data', c => body += c);
      upstream.on('end', () => {
        _analytics.fxProxy.fail++;
        _pushError({ ts: new Date().toISOString(), type: 'fx', status: upstream.statusCode, body: body.slice(0, 200) });
        res.status(upstream.statusCode).type('json').send(body || '{"error":"upstream error"}');
      });
      return;
    }
    _analytics.fxProxy.success++;
    _analytics.fxProxy.totalMs += Date.now() - start;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
  } catch (e) {
    _analytics.fxProxy.fail++;
    _pushError({ ts: new Date().toISOString(), type: 'fx', error: e.message });
    res.status(502).json({ error: 'fx proxy failed' });
  }
});

/**
 * POST /api/enrich
 * Body: { qid, wiki_thumb, wiki_extract, wiki_images }
 *
 * Persists Wikipedia data into cities-full.json for the city identified by QID.
 * Only null fields are ever written — existing values are never overwritten.
 * All other Wikidata fields are untouched.
 */
app.post('/api/enrich', (req, res) => {
  const { qid, wiki_thumb, wiki_extract, wiki_images } = req.body ?? {};

  if (!qid || typeof qid !== 'string' || !/^Q\d+$/.test(qid)) {
    _analytics.enrich.fail++;
    return res.status(400).json({ error: 'invalid qid' });
  }

  _writeLock = _writeLock.then(() => {
    let cities;
    try {
      cities = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    } catch {
      _analytics.enrich.fail++;
      return res.status(500).json({ error: 'could not read cities file' });
    }

    const city = cities.find(c => c.qid === qid);
    if (!city) {
      _analytics.enrich.fail++;
      return res.status(404).json({ error: 'city not found' });
    }

    let changed = false;
    if (wiki_thumb   && typeof wiki_thumb   === 'string' && !city.wiki_thumb)   { city.wiki_thumb   = wiki_thumb;   changed = true; }
    if (wiki_extract && typeof wiki_extract === 'string' && !city.wiki_extract) { city.wiki_extract = wiki_extract; changed = true; }
    if (Array.isArray(wiki_images) && wiki_images.length && !city.wiki_images) {
      city.wiki_images = wiki_images.filter(u => typeof u === 'string').slice(0, 10);
      changed = true;
    }

    if (changed) {
      try {
        fs.writeFileSync(OUT_FILE, JSON.stringify(cities), 'utf8');
      } catch {
        _analytics.enrich.fail++;
        return res.status(500).json({ error: 'could not write cities file' });
      }
    }

    _analytics.enrich.success++;
    res.json({ ok: true, changed });
  }).catch(err => {
    _analytics.enrich.fail++;
    _pushError({ ts: new Date().toISOString(), type: 'enrich', error: err.message });
    if (!res.headersSent) res.status(500).json({ error: 'internal error' });
  });
});

// ── Analytics endpoint ──
app.get('/analytics', (req, res) => {
  const uptimeMs = Date.now() - START_MS;
  const mem = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  // Data file inventory
  const dataDir = path.join(__dirname, 'public');
  let dataFiles = [];
  try {
    dataFiles = fs.readdirSync(dataDir)
      .filter(f => f.endsWith('.json') && f !== 'app.js.meta.json')
      .map(f => {
        const stat = fs.statSync(path.join(dataDir, f));
        return { file: f, size: stat.size, modified: stat.mtimeMs };
      })
      .sort((a, b) => b.size - a.size);
  } catch {}

  const totalDataBytes = dataFiles.reduce((s, f) => s + f.size, 0);
  const recentRequests = _analytics.requests.slice(-100);
  const statusCounts = {};
  recentRequests.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
  const pathCounts = {};
  recentRequests.forEach(r => { const p = r.path.replace(/\/[0-9a-f]{8,}/g, '/:id'); pathCounts[p] = (pathCounts[p] || 0) + 1; });

  // FX latency percentiles
  const fxLatMs = _analytics.fxProxy.totalMs;
  const fxAvg = _analytics.fxProxy.success > 0 ? Math.round(fxLatMs / _analytics.fxProxy.success) : null;

  res.type('json').json({
    status: 'ok',
    uptime: { ms: uptimeMs, human: _formatDuration(uptimeMs) },
    started: new Date(START_MS).toISOString(),
    server: {
      node: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      hostname: os.hostname(),
      env: process.env.NODE_ENV || 'development',
    },
    memory: {
      rss: _fmtBytes(mem.rss),
      heapUsed: _fmtBytes(mem.heapUsed),
      heapTotal: _fmtBytes(mem.heapTotal),
      external: _fmtBytes(mem.external),
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
    data: {
      files: dataFiles.length,
      totalSize: _fmtBytes(totalDataBytes),
      totalBytes: totalDataBytes,
      largest: dataFiles.slice(0, 10).map(f => ({ file: f.file, size: _fmtBytes(f.size), modified: new Date(f.modified).toISOString() })),
    },
    bundle: _bundleStats(),
    fxProxy: {
      success: _analytics.fxProxy.success,
      fail: _analytics.fxProxy.fail,
      avgLatencyMs: fxAvg,
      totalLatencyMs: fxLatMs,
    },
    enrich: {
      success: _analytics.enrich.success,
      fail: _analytics.enrich.fail,
    },
    requests: {
      total: _analytics.requests.length,
      statusCounts,
      pathCounts,
      recent: recentRequests,
      avgLatencyMs: recentRequests.length > 0
        ? Math.round(recentRequests.reduce((s, r) => s + r.ms, 0) / recentRequests.length)
        : null,
    },
    errors: _analytics.errors.slice(-20),
  });
});

// ── Analytics HTML dashboard ──
app.get('/analytics/dashboard', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WDM Analytics</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0d1117;--bg2:#161b22;--fg:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--red:#f85149;--gold:#f0a500;--border:#30363d}
body{background:var(--bg);color:var(--fg);font:14px/1.5 'Segoe UI',system-ui,sans-serif;padding:20px;max-width:1200px;margin:auto}
h1{font-size:1.4rem;margin-bottom:4px}
h2{font-size:1rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:20px 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.card .label{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.card .value{font-size:1.4rem;font-weight:700;margin-top:2px}
.card .sub{font-size:.72rem;color:var(--muted);margin-top:2px}
.ok{color:var(--green)}.err{color:var(--red)}.warn{color:var(--gold)}
table{width:100%;border-collapse:collapse;font-size:.8rem}
th{text-align:left;padding:6px 8px;color:var(--muted);border-bottom:1px solid var(--border);font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-size:.68rem}
td{padding:6px 8px;border-bottom:1px solid var(--border)}
.mono{font-variant-numeric:tabular-nums;font-family:'Cascadia Code',Consolas,monospace;font-size:.78rem}
.badge{display:inline-block;padding:1px 6px;border-radius:10px;font-size:.68rem;font-weight:600}
.badge-ok{background:rgba(63,185,80,.12);color:var(--green)}.badge-err{background:rgba(248,81,73,.12);color:var(--red)}.badge-warn{background:rgba(240,165,0,.12);color:var(--gold)}
</style>
</head>
<body>
<h1>🌍 WDM Analytics</h1>
<p id="subtitle" style="color:var(--muted);font-size:.82rem">Loading…</p>
<h2>System</h2>
<div class="grid" id="sys-grid"></div>
<h2>Data</h2>
<div class="grid" id="data-grid"></div>
<h2>API Health</h2>
<div class="grid" id="api-grid"></div>
<h2>Recent Requests</h2>
<table><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Latency</th></tr></thead><tbody id="req-body"></tbody></table>
<h2>Recent Errors</h2>
<table><thead><tr><th>Time</th><th>Type</th><th>Detail</th></tr></thead><tbody id="err-body"></tbody></table>
<script>
fetch('/analytics').then(r=>r.json()).then(d=>{
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmt=t=>t?t.replace('T',' ').slice(0,19):'—';
  const ok=v=>v>0?'ok':'err';
  document.getElementById('subtitle').textContent='Uptime: '+d.uptime.human+' · Started: '+fmt(d.started);
  document.getElementById('sys-grid').innerHTML=[
    card('Node',esc(d.server.node),'Runtime'),
    card(_fmtB(d.memory.rssBytes),esc(d.memory.heapUsed)+' heap','Memory'),
    card(d.server.cpus+' cores',esc(d.server.platform)+'/'+esc(d.server.arch),'Server'),
  ].join('');
  document.getElementById('data-grid').innerHTML=[
    card(d.data.files+' files',d.data.totalSize+' total','Data Files'),
    card(d.bundle.size,_fmtB(d.bundle.gzipSize)+' gzip','Bundle'),
    ...d.data.largest.slice(0,5).map(f=>card(f.size,esc(f.file),f.modified?fmt(f.modified):'')),
  ].join('');
  const fxPct=d.fxProxy.success+d.fxProxy.fail>0?Math.round(100*d.fxProxy.success/(d.fxProxy.success+d.fxProxy.fail)):null;
  const enPct=d.enrich.success+d.enrich.fail>0?Math.round(100*d.enrich.success/(d.enrich.success+d.enrich.fail)):null;
  document.getElementById('api-grid').innerHTML=[
    card(d.fxProxy.success+' ok',d.fxProxy.fail+' fail','FX Proxy '+(fxPct!==null?'<span class="badge badge-'+ok(fxPct)+'">'+fxPct+'%</span>':'')),
    card(d.fxProxy.avgLatencyMs+'ms','total '+d.fxProxy.totalLatencyMs+'ms','FX Latency'),
    card(d.enrich.success+' ok',d.enrich.fail+' fail','Enrich '+(enPct!==null?'<span class="badge badge-'+ok(enPct)+'">'+enPct+'%</span>':'')),
    card(d.requests.total,d.requests.avgLatencyMs+'ms avg','Requests'),
  ].join('');
  const rb=document.getElementById('req-body');
  d.requests.recent.reverse().forEach(r=>{
    rb.innerHTML+='<tr><td class="mono">'+fmt(r.ts)+'</td><td>'+esc(r.method)+'</td><td class="mono">'+esc(r.path)+'</td><td><span class="badge badge-'+(r.status<400?'ok':'err')+'">'+r.status+'</span></td><td class="mono">'+r.ms+'ms</td></tr>';
  });
  const eb=document.getElementById('err-body');
  d.errors.reverse().forEach(e=>{
    eb.innerHTML+='<tr><td class="mono">'+fmt(e.ts)+'</td><td>'+esc(e.type)+'</td><td class="mono">'+esc(e.error||e.body||e.status||'—')+'</td></tr>';
  });
}).catch(e=>{document.body.innerHTML='<h1>Error</h1><p>'+esc(e.message)+'</p>'});
function card(v,sub,label){return '<div class="card"><div class="label">'+label+'</div><div class="value">'+v+'</div><div class="sub">'+sub+'</div></div>';}
function _fmtB(b){if(b<1024)return b+'B';if(b<1048576)return(b/1024).toFixed(1)+'KB';return(b/1048576).toFixed(1)+'MB';}
</script>
</body></html>`);
});

function _fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function _formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
  if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}

function _bundleStats() {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'app.js.meta.json'), 'utf8'));
    const outputs = meta.outputs || {};
    const main = outputs['public/app.js'] || outputs['app.js'] || {};
    const inputs = main.inputs || {};
    const totalSize = main.bytes || 0;
    return {
      size: _fmtBytes(totalSize),
      bytes: totalSize,
      gzipSize: main.bytes || 0,
      inputCount: Object.keys(inputs).length,
      builtAt: meta.buildStarted ? new Date(meta.buildStarted).toISOString() : null,
    };
  } catch {
    return { size: '?', bytes: 0, gzipSize: 0, inputCount: 0, builtAt: null };
  }
}

const server = app.listen(PORT, () => {
  console.log(`World Data Map running at http://localhost:${server.address().port}`);
});
