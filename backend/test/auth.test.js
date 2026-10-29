const test = require('node:test');
const assert = require('node:assert/strict');
const { newApp } = require('./helpers');

test('register validates input, login checks the password, logout ends the session', async () => {
  const { agent, request } = await newApp();
  await agent.post('/api/auth/register').send({ email: 'nope', password: 'password123' }).expect(400);
  await agent.post('/api/auth/register').send({ email: 'a@example.com', password: 'short' }).expect(400);
  await agent.post('/api/auth/register').send({ email: 'a@example.com', password: 'password123' }).expect(201);
  await agent.post('/api/auth/register').send({ email: 'A@example.com', password: 'password123' }).expect(409);
  await agent.get('/api/me').expect(200);

  await agent.post('/api/auth/logout').expect(200);
  await agent.get('/api/me').expect(401);
  await request().post('/api/auth/login').send({ email: 'a@example.com', password: 'wrong-password' }).expect(401);
  await agent.post('/api/auth/login').send({ email: 'a@example.com', password: 'password123' }).expect(200);
  await agent.get('/api/me').expect(200);
});

test('malformed JSON and unknown routes return JSON errors', async () => {
  const { request } = await newApp();
  const res = await request().post('/api/auth/login').set('Content-Type', 'application/json').send('{bad').expect(400);
  assert.equal(res.body.error, 'Invalid JSON.');
  await request().get('/api/nope').expect(404);
});

test('cross-site state-changing requests are blocked and login attempts are rate limited', async () => {
  const { request, agent } = await newApp();
  await agent.post('/api/auth/register').send({ email: 'x@example.com', password: 'password123' }).expect(201);
  const res = await agent.post('/api/albums').set('Origin', 'https://evil.example').send({ name: 'x' }).expect(403);
  assert.match(res.body.error, /Cross-site/);
  await agent.post('/api/albums').set('Origin', 'http://127.0.0.1').set('Host', '127.0.0.1').send({ name: 'ok' }).expect(201);

  const lim = await newApp({ authRateLimit: 3 });
  for (let i = 0; i < 3; i++) await lim.request().post('/api/auth/login').send({ email: 'x@example.com', password: 'wrong-pass' }).expect(401);
  await lim.request().post('/api/auth/login').send({ email: 'x@example.com', password: 'wrong-pass' }).expect(429);
});
