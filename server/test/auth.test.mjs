import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { parseCookies, safeNext, verifyAccessToken } from '../auth.mjs';

const SECRET = 'unit-test-secret';
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function token(payload, secret = SECRET, header = { alg: 'HS256', typ: 'JWT' }) {
  const body = `${b64(header)}.${b64(payload)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

const good = { sub: 'u1', aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 };

test('accepts a valid access token', () => {
  assert.equal(verifyAccessToken(token(good), SECRET)?.sub, 'u1');
});

test('rejects bad signature, expiry, audience, role, algorithm and missing secret', () => {
  assert.equal(verifyAccessToken(token(good, 'other'), SECRET), null);
  assert.equal(verifyAccessToken(token({ ...good, exp: 1 }), SECRET), null);
  assert.equal(verifyAccessToken(token({ ...good, aud: 'x' }), SECRET), null);
  assert.equal(verifyAccessToken(token({ ...good, role: 'service_role' }), SECRET), null);
  assert.equal(verifyAccessToken(token(good, SECRET, { alg: 'none' }), SECRET), null);
  assert.equal(verifyAccessToken(token(good), ''), null);
  assert.equal(verifyAccessToken('not.a.jwt', SECRET), null);
  assert.equal(verifyAccessToken(undefined, SECRET), null);
});

test('parses cookies and only allows same-site relative redirects', () => {
  assert.deepEqual(parseCookies('a=1; vo_at=xyz; b=2'), { a: '1', vo_at: 'xyz', b: '2' });
  assert.equal(safeNext('/?vin=ABC'), '/?vin=ABC');
  assert.equal(safeNext('//evil.com'), '/');
  assert.equal(safeNext('https://evil.com'), '/');
  assert.equal(safeNext('/\\evil'), '/');
  assert.equal(safeNext(undefined), '/');
});
