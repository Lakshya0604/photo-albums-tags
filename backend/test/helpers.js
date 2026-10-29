const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../src/app');
const { makeJpeg } = require('../src/sampleImage');

function newApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-albums-test-'));
  const ctx = createApp({ dataDir, maxUploadMb: 1, maxFiles: 5 });
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
