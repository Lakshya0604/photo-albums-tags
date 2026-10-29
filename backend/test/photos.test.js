const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { newApp, signup, upload, makeJpeg } = require('./helpers');

test('upload creates a server-side thumbnail much smaller than the original', async () => {
  const { agent, config } = newApp();
  await signup(agent);
  const big = await makeJpeg({ width: 3000, height: 2000, seed: 2 });
  const res = await upload(agent, [{ buffer: big }]).expect(201);
  const id = res.body.photos[0].id;

  const thumbRes = await agent.get(`/api/photos/${id}/thumb`).expect(200);
  const meta = await sharp(thumbRes.body).metadata();
  assert.ok(meta.width <= 320 && meta.height <= 320, 'thumbnail is at most 320px');
  const thumbFiles = fs.readdirSync(path.join(config.dataDir, 'uploads', 'thumbs'));
  assert.equal(thumbFiles.length, 1);
  assert.ok(thumbRes.body.length < big.length / 5, 'thumbnail is far smaller than the original');
});

test('uploading several photos at once works, and invalid files are rejected with a clear error', async () => {
  const { agent } = newApp();
  await signup(agent);
  const a = await makeJpeg({ seed: 2 });
  const b = await makeJpeg({ seed: 2 });
  const ok = await upload(agent, [{ buffer: a }, { buffer: b }]).expect(201);
  assert.equal(ok.body.photos.length, 2);

  const mixed = await upload(agent, [{ buffer: a }, { buffer: Buffer.from('not an image'), name: 'fake.jpg' }]).expect(201);
  assert.equal(mixed.body.photos.length, 1);
  assert.match(mixed.body.errors[0], /fake\.jpg.*not a valid/);

  const bad = await upload(agent, [{ buffer: Buffer.from('<svg/>'), name: 'x.jpg' }]).expect(400);
  assert.match(bad.body.error, /not a valid/);
  await agent.post('/api/photos').expect(400);
});

test('photos sort by EXIF date taken and fall back to the upload date', async () => {
  const { agent } = newApp();
  await signup(agent);
  const old = await makeJpeg({ seed: 2, takenAt: '2019:01:02 10:00:00' });
  const mid = await makeJpeg({ seed: 2, takenAt: '2021:06:07 10:00:00' });
  const none = await makeJpeg({ seed: 2 });
  await upload(agent, [{ buffer: mid, name: 'mid.jpg' }, { buffer: none, name: 'none.jpg' }, { buffer: old, name: 'old.jpg' }]).expect(201);

  const desc = (await agent.get('/api/photos?order=desc').expect(200)).body.photos;
  assert.deepEqual(desc.map((p) => p.name), ['none.jpg', 'mid.jpg', 'old.jpg']);
  assert.equal(desc[0].dateSource, 'upload');
  assert.equal(desc[1].dateSource, 'exif');
  const asc = (await agent.get('/api/photos?order=asc').expect(200)).body.photos;
  assert.deepEqual(asc.map((p) => p.name), ['old.jpg', 'mid.jpg', 'none.jpg']);
});

test('tag search matches all tags by default and any tag on request; tags are validated', async () => {
  const { agent } = newApp();
  await signup(agent);
  const img = await makeJpeg();
  const r = await upload(agent, [{ buffer: img, name: 'one.jpg' }, { buffer: img, name: 'two.jpg' }]).expect(201);
  const [p1, p2] = r.body.photos.map((p) => p.id).sort((x, y) => x - y);
  await agent.put(`/api/photos/${p1}/tags`).send({ tags: ['Beach', ' summer ', 'beach'] }).expect(200);
  await agent.put(`/api/photos/${p2}/tags`).send({ tags: ['beach'] }).expect(200);

  const both = (await agent.get('/api/photos?tags=beach,summer')).body.photos;
  assert.deepEqual(both.map((p) => p.id), [p1]);
  assert.deepEqual(both[0].tags, ['beach', 'summer'], 'tags are lowercased and de-duplicated');
  const any = (await agent.get('/api/photos?tags=summer,beach&match=any')).body.photos;
  assert.equal(any.length, 2);
  assert.equal((await agent.get('/api/photos?tags=nothing')).body.photos.length, 0);

  const bad = await agent.put(`/api/photos/${p1}/tags`).send({ tags: ['<script>'] }).expect(400);
  assert.match(bad.body.error, /Invalid tag/);
  await agent.put(`/api/photos/${p1}/tags`).send({ tags: 'beach' }).expect(400);
});

test('users cannot see or change each other\'s photos', async () => {
  const { agent, request, newAgent } = newApp();
  await signup(agent, 'owner@example.com');
  const r = await upload(agent, [{ buffer: await makeJpeg() }]).expect(201);
  const id = r.body.photos[0].id;

  const other = newAgent();
  await signup(other, 'other@example.com');
  await other.get(`/api/photos/${id}/thumb`).expect(404);
  await other.delete(`/api/photos/${id}`).expect(404);
  assert.equal((await other.get('/api/photos')).body.photos.length, 0);
  await request().get('/api/photos').expect(401);
});
