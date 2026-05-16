const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const DATA_URL = 'https://www.kronoak.com/live/2026/media/data/zegamaaizkorri.json';
const PORT     = process.env.PORT || 3000;
const CACHE_MS = 110_000; // 110s — slightly under the 120s source refresh

let cache = { buf: null, ts: 0 };

function fetchUpstream(res) {
  const opts = { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } };
  const req = https.get(DATA_URL, opts, (upstream) => {
    const chunks = [];
    upstream.on('data', c => chunks.push(c));
    upstream.on('end', () => {
      cache = { buf: Buffer.concat(chunks), ts: Date.now() };
      send(res, 200, 'application/json', cache.buf);
    });
  });
  req.on('error', () => {
    // If upstream fails but we have stale cache, serve it anyway
    if (cache.buf) {
      send(res, 200, 'application/json', cache.buf);
    } else {
      send(res, 502, 'application/json', Buffer.from('{"error":"upstream unavailable"}'));
    }
  });
}

function send(res, status, type, buf) {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);

  if (pathname === '/api/results') {
    const age = Date.now() - cache.ts;
    if (cache.buf && age < CACHE_MS) {
      send(res, 200, 'application/json', cache.buf);
    } else {
      fetchUpstream(res);
    }
    return;
  }

  const target = pathname === '/' ? '/index.html' : pathname;
  const file   = path.join(__dirname, target);

  // Prevent path traversal
  if (!file.startsWith(__dirname)) {
    res.writeHead(403); res.end(); return;
  }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Zegama live tracker running on :${PORT}`));
