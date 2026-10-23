// Session handling for the VinOrbits origin: logs in through the local GoTrue
// (Supabase Auth) service, keeps the tokens in HttpOnly cookies, and checks the
// HS256 access token on every request. Fails closed: with no secret, nobody gets in.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';

const AUTH_HOST = '127.0.0.1';
const AUTH_PORT = 9999;
const ACCESS_COOKIE = 'vo_at';
const REFRESH_COOKIE = 'vo_rt';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60;
const MAX_BODY = 2048;

/** The JWT secret arrives as a systemd credential, never as an environment variable. */
export function loadJwtSecret(dir = process.env.CREDENTIALS_DIRECTORY) {
  if (!dir) return '';
  try {
    return readFileSync(`${dir}/jwt`, 'utf8').trim();
  } catch {
    return '';
  }
}

function b64urlJson(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** Returns the token payload, or null for anything that is not a valid, unexpired access token. */
export function verifyAccessToken(token, secret, nowMs = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = b64urlJson(parts[0]);
    if (header.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = b64urlJson(parts[1]);
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return null;
    if (payload.aud !== 'authenticated' || payload.role !== 'authenticated' || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

function setCookie(name, value, { maxAge, path = '/', sameSite = 'Lax' }) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=${sameSite}`;
}

export function sessionCookies(tokens) {
  return [
    setCookie(ACCESS_COOKIE, tokens.access_token, { maxAge: Math.max(60, Number(tokens.expires_in) || 3600) }),
    setCookie(REFRESH_COOKIE, tokens.refresh_token, { maxAge: REFRESH_MAX_AGE, path: '/auth', sameSite: 'Strict' }),
  ];
}

export function clearedCookies() {
  return [
    setCookie(ACCESS_COOKIE, '', { maxAge: 0 }),
    setCookie(REFRESH_COOKIE, '', { maxAge: 0, path: '/auth', sameSite: 'Strict' }),
  ];
}

/** Only same-site relative paths may be used as a post-login destination. */
export function safeNext(value) {
  return typeof value === 'string' && /^\/(?!\/)[\w\-./?=&%~]*$/.test(value) ? value : '/';
}

function callGotrue(method, path, body, bearer) {
  return new Promise((resolveCall) => {
    const payload = body ? JSON.stringify(body) : null;
    const request = httpRequest({
      hostname: AUTH_HOST,
      port: AUTH_PORT,
      path,
      method,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size <= 64 * 1024) chunks.push(chunk);
      });
      response.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch { /* not JSON */ }
        resolveCall({ status: response.statusCode || 502, json });
      });
    });
    request.setTimeout(8000, () => request.destroy(new Error('auth timeout')));
    request.on('error', () => resolveCall({ status: 503, json: null }));
    if (payload) request.write(payload);
    request.end();
  });
}

export async function passwordLogin(email, password) {
  return callGotrue('POST', '/token?grant_type=password', { email, password });
}

export async function refreshSession(refreshToken) {
  return callGotrue('POST', '/token?grant_type=refresh_token', { refresh_token: refreshToken });
}

export async function endSession(accessToken) {
  if (accessToken) await callGotrue('POST', '/logout?scope=local', null, accessToken);
}

export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

/** True when the request came from our own pages (browsers send Origin on POST). */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.headers.host || '').toLowerCase();
  } catch {
    return false;
  }
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
