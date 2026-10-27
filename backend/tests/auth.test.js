import test from 'node:test';
import assert from 'node:assert/strict';
import expressSession from 'express-session';
import { createApp } from '../src/app.js';

function memoryUsers() {
  const rows = new Map(); let sequence = 0;
  return {
    async create(data) { if (rows.has(data.email)) throw Object.assign(new Error('duplicate'), { code: 11000 }); const user = { ...data, _id: `test-user-${++sequence}` }; rows.set(user.email, user); return user; },
    findOne({ email }) { return { select: async () => rows.get(email) || null }; },
    async findById(id) { return [...rows.values()].find((user) => user._id === id) || null; },
  };
}
function cookieFrom(response) { return (response.headers.get('set-cookie') || '').split(';')[0]; }
async function start(t) {
  const app = createApp({ users: memoryUsers(), sessionMiddleware: expressSession({ name: 'quantara.sid', secret: 'test-only-session-secret-123456789', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax' } }) });
  const server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve)); t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}
async function csrf(root) {
  const response = await fetch(`${root}/api/auth/csrf`);
  return { cookie: cookieFrom(response), token: (await response.json()).csrfToken };
}

test('authentication validates, creates an account, persists a session, and logs out safely', async (t) => {
  const root = await start(t);
  const anonymous = await csrf(root);
  const invalid = await fetch(`${root}/api/auth/register`, { method: 'POST', headers: { cookie: anonymous.cookie, 'X-CSRF-Token': anonymous.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test', email: 'bad', password: 'tiny' }) });
  assert.equal(invalid.status, 400);
  const created = await fetch(`${root}/api/auth/register`, { method: 'POST', headers: { cookie: anonymous.cookie, 'X-CSRF-Token': anonymous.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test User', email: 'Test@Example.com', password: 'long-secure-password', confirmPassword: 'long-secure-password' }) });
  assert.equal(created.status, 201);
  const sessionCookie = cookieFrom(created); const user = (await created.json()).user;
  assert.equal(user.email, 'test@example.com'); assert.equal('passwordHash' in user, false);
  const me = await fetch(`${root}/api/auth/me`, { headers: { cookie: sessionCookie } });
  assert.equal(me.status, 200); assert.equal((await me.json()).user.id, user.id);
  const duplicate = await fetch(`${root}/api/auth/register`, { method: 'POST', headers: { cookie: sessionCookie, 'X-CSRF-Token': (await fetch(`${root}/api/auth/csrf`, { headers: { cookie: sessionCookie } }).then((r) => r.json())).csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Again', email: 'TEST@example.com', password: 'long-secure-password' }) });
  assert.equal(duplicate.status, 409);
  const csrfToken = (await fetch(`${root}/api/auth/csrf`, { headers: { cookie: sessionCookie } }).then((r) => r.json())).csrfToken;
  const logout = await fetch(`${root}/api/auth/logout`, { method: 'POST', headers: { cookie: sessionCookie, 'X-CSRF-Token': csrfToken } });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${root}/api/auth/me`, { headers: { cookie: sessionCookie } })).status, 401);
});

test('login uses a generic credential error and establishes a fresh session', async (t) => {
  const root = await start(t); const anon = await csrf(root);
  await fetch(`${root}/api/auth/register`, { method: 'POST', headers: { cookie: anon.cookie, 'X-CSRF-Token': anon.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test User', email: 'person@example.com', password: 'long-secure-password' }) });
  const fresh = await csrf(root);
  const bad = await fetch(`${root}/api/auth/login`, { method: 'POST', headers: { cookie: fresh.cookie, 'X-CSRF-Token': fresh.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'person@example.com', password: 'wrong-password' }) });
  const body = await bad.json(); assert.equal(bad.status, 401); assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  const unknown = await fetch(`${root}/api/auth/login`, { method: 'POST', headers: { cookie: fresh.cookie, 'X-CSRF-Token': fresh.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'unknown@example.com', password: 'wrong-password' }) });
  assert.equal(unknown.status, 401); assert.equal((await unknown.json()).error.code, 'INVALID_CREDENTIALS');
  const noCsrf = await fetch(`${root}/api/auth/login`, { method: 'POST', headers: { cookie: fresh.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'person@example.com', password: 'long-secure-password' }) });
  assert.equal(noCsrf.status, 403);
  const retryCsrf = await csrf(root);
  const login = await fetch(`${root}/api/auth/login`, { method: 'POST', headers: { cookie: retryCsrf.cookie, 'X-CSRF-Token': retryCsrf.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'PERSON@example.com', password: 'long-secure-password' }) });
  assert.equal(login.status, 200);
  assert.equal((await fetch(`${root}/api/auth/me`, { headers: { cookie: cookieFrom(login) } })).status, 200);
  assert.equal((await fetch(`${root}/api/auth/me`)).status, 401);
});
