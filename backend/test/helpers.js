const crypto = require('crypto');
const request = require('supertest');
const { after } = require('node:test');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const { makeJpeg } = require('../src/sampleImage');

// One in-memory MongoDB per test file; every app gets its own database.
let server;
const apps = [];
async function mongoUri() {
  server ||= await MongoMemoryServer.create();
  return server.getUri();
}
after(async () => {
  await Promise.all(apps.map((db) => db.close()));
  if (server) await server.stop();
});

async function newApp(overrides = {}) {
  const mongoUri_ = await mongoUri();
  const ctx = await createApp({
    mongoUri: mongoUri_, mongoDb: `t_${crypto.randomBytes(6).toString('hex')}`, maxUploadMb: 1, maxFiles: 5, ...overrides,
  });
  apps.push(ctx.db);
  return { ...ctx, agent: request.agent(ctx.app), newAgent: () => request.agent(ctx.app), request: () => request(ctx.app) };
}

async function signup(agent, email = 'a@example.com') {
  await agent.post('/api/auth/register').send({ email, password: 'password123' }).expect(201);
}

function upload(agent, files, extra = {}) {
  let req = agent.post('/api/photos');
  for (const [k, v] of Object.entries(extra)) req = req.field(k, v);
  files.forEach((f, i) => { req = req.attach('photos', f.buffer, { filename: f.name || `p${i}.jpg`, contentType: 'image/jpeg' }); });
  return req;
}

module.exports = { newApp, signup, upload, makeJpeg };
