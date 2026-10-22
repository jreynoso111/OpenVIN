import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { isIP } from 'node:net';
import { request as httpRequest, createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 3118;
const PRIVATE_API_HOST = '127.0.0.1';
const PRIVATE_API_PORT = 3117;
const MAX_FIELD_LENGTH = 100;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const distRoot = await realpath(resolve(appRoot, 'dist'));
const allowedHosts = new Set([
  'app.vinorbits.com',
  '127.0.0.1:3118',
  'localhost:3118',
]);
const rateWindows = new Map();

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.nhtsa.gov https://vpic.nhtsa.dot.gov https://data.ny.gov https://data.transportation.gov https://www.fueleconomy.gov",
  ].join('; '),
};

function sendJson(res, status, value, extraHeaders = {}) {
  res.writeHead(status, {
    ...securityHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(JSON.stringify(value));
}

function hostAllowed(req) {
  return allowedHosts.has(String(req.headers.host || '').toLowerCase());
}

function clientKey(req) {
  const forwarded = String(req.headers['cf-connecting-ip'] || '').split(',')[0].trim();
  const candidate = forwarded || req.socket.remoteAddress || 'unknown';
  return isIP(candidate) ? candidate : 'unknown';
}

function allowRequest(req) {
  const now = Date.now();
  const key = clientKey(req);
  let window = rateWindows.get(key);
  if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
    window = { startedAt: now, count: 0 };
    rateWindows.set(key, window);
  }
  window.count += 1;
  if (rateWindows.size > 10_000) {
    for (const [ip, entry] of rateWindows) {
      if (now - entry.startedAt >= RATE_WINDOW_MS) rateWindows.delete(ip);
    }
  }
  return window.count <= RATE_LIMIT;
}

function mimeType(pathname) {
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  })[extname(pathname).toLowerCase()] || 'application/octet-stream';
}

async function staticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.split('/').some((part) => part.startsWith('.') && part !== '.')) return null;
  const candidate = resolve(distRoot, `.${decoded}`);
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${sep}`)) return null;
  try {
    const file = await realpath(candidate);
    if (file !== distRoot && !file.startsWith(`${distRoot}${sep}`)) return null;
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}

async function serveStatic(req, res, pathname) {
  let file = await staticFile(pathname);
  if (!file && !pathname.startsWith('/api/')) file = resolve(distRoot, 'index.html');
  if (!file) return sendJson(res, 404, { error: 'Not found' });

  const info = await stat(file);
  const immutable = pathname.startsWith('/assets/');
  res.writeHead(200, {
    ...securityHeaders,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Length': info.size,
    'Content-Type': mimeType(file),
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

function proxyNhtsaOdi(req, res, url) {
  if (!allowRequest(req)) {
    return sendJson(res, 429, { error: 'Rate limit exceeded' }, { 'Retry-After': '60' });
  }

  const yearText = url.searchParams.get('year') || '';
  const make = (url.searchParams.get('make') || '').trim();
  const model = (url.searchParams.get('model') || '').trim();
  const year = Number(yearText);
  if (!/^\d{4}$/.test(yearText) || !Number.isInteger(year) || year < 1886 || year > 2100 ||
      !make || !model || make.length > MAX_FIELD_LENGTH || model.length > MAX_FIELD_LENGTH) {
    return sendJson(res, 400, { error: 'Valid model year, make, and model are required' });
  }

  const query = new URLSearchParams({ year: String(year), make, model });
  const upstream = httpRequest({
    hostname: PRIVATE_API_HOST,
    port: PRIVATE_API_PORT,
    path: `/api/v1/nhtsa/odi?${query.toString()}`,
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Host: `${PRIVATE_API_HOST}:${PRIVATE_API_PORT}`,
    },
  }, (response) => {
    const headers = {
      'Content-Type': response.headers['content-type'] || 'application/json; charset=utf-8',
      'Cache-Control': response.statusCode === 200
        ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=900'
        : 'no-store',
    };
    res.writeHead(response.statusCode || 502, { ...securityHeaders, ...headers });
    response.pipe(res);
  });

  upstream.setTimeout(12_000, () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) sendJson(res, 503, { error: 'Vehicle data is temporarily unavailable' });
    else res.destroy();
  });
  res.on('close', () => {
    if (!res.writableEnded) upstream.destroy();
  });
  upstream.end();
}

const server = createServer(async (req, res) => {
  if (!hostAllowed(req)) return sendJson(res, 421, { error: 'Unknown host' });

  let url;
  try {
    url = new URL(req.url, 'http://vinorbits.local');
  } catch {
    return sendJson(res, 400, { error: 'Invalid request' });
  }

  if (url.pathname === '/api/v1/nhtsa/odi') {
    if (req.method !== 'GET') {
      res.writeHead(405, { ...securityHeaders, Allow: 'GET' });
      return res.end();
    }
    return proxyNhtsaOdi(req, res, url);
  }
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...securityHeaders, Allow: 'GET, HEAD' });
    return res.end();
  }
  return serveStatic(req, res, url.pathname);
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxConnections = 128;
server.maxRequestsPerSocket = 100;
server.listen(PORT, HOST, () => console.log(`VinOrbits Cloudflare origin listening on ${HOST}:${PORT}`));

async function shutdown() {
  server.close();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
