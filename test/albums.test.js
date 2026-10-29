const test = require('node:test');
const assert = require('node:assert/strict');
const { newApp, signup, upload, makeJpeg } = require('./helpers');

async function setup() {
  const ctx = newApp();
  await signup(ctx.agent);
  const img = await makeJpeg();
  const r = await upload(ctx.agent, [{ buffer: img, name: 'a.jpg' }, { buffer: img, name: 'b.jpg' }, { buffer: img, name: 'c.jpg' }]).expect(201);
  const ids = r.body.photos.map((p) => p.id);
  const album = (await ctx.agent.post('/api/albums').send({ name: 'Trip' }).expect(201)).body.album;
  return { ...ctx, ids, album };
}

test('album create, rename, add/remove photos and choose cover', async () => {
  const { agent, ids, album } = await setup();
  await agent.post('/api/albums').send({ name: '   ' }).expect(400);
  await agent.post('/api/albums').send({ name: 'x'.repeat(81) }).expect(400);

  await agent.patch(`/api/albums/${album.id}`).send({ name: 'Trip 2024' }).expect(200);
  await agent.post(`/api/albums/${album.id}/photos`).send({ photoIds: [ids[0], ids[1]] }).expect(200);
  await agent.post(`/api/albums/${album.id}/photos`).send({ photoIds: [999999] }).expect(400);

  let detail = (await agent.get(`/api/albums/${album.id}`)).body;
  assert.equal(detail.album.name, 'Trip 2024');
  assert.equal(detail.photos.length, 2);

  await agent.patch(`/api/albums/${album.id}`).send({ coverPhotoId: ids[2] }).expect(400); // not in album
  await agent.patch(`/api/albums/${album.id}`).send({ coverPhotoId: ids[1] }).expect(200);
  detail = (await agent.get(`/api/albums/${album.id}`)).body;
  assert.equal(detail.album.coverPhotoId, ids[1]);

  await agent.delete(`/api/albums/${album.id}/photos/${ids[1]}`).expect(200);
  detail = (await agent.get(`/api/albums/${album.id}`)).body;
  assert.equal(detail.photos.length, 1);
  assert.notEqual(detail.album.coverPhotoId, ids[1], 'cover resets when its photo is removed');
});

test('public link works read-only and stops working immediately when turned off', async () => {
  const { agent, request, ids, album } = await setup();
  await agent.post(`/api/albums/${album.id}/photos`).send({ photoIds: [ids[0]] }).expect(200);
  const { shareToken } = (await agent.post(`/api/albums/${album.id}/share`).expect(200)).body;

  // No login needed, thumbnails and originals are available.
  const pub = await request().get(`/api/public/${shareToken}`).expect(200);
  assert.equal(pub.body.photos.length, 1);
  assert.equal(pub.body.album.name, 'Trip');
  await request().get(`/api/public/${shareToken}/photos/${ids[0]}/thumb`).expect(200);
  await request().get(`/api/public/${shareToken}/photos/${ids[0]}/file`).expect(200);
  // A photo that is not in the album is not reachable through the link.
  await request().get(`/api/public/${shareToken}/photos/${ids[1]}/thumb`).expect(404);
  // Public link is read-only.
  await request().post(`/api/public/${shareToken}`).expect(404);
  await request().delete(`/api/albums/${album.id}`).expect(401);

  await agent.delete(`/api/albums/${album.id}/share`).expect(200);
  await request().get(`/api/public/${shareToken}`).expect(404);
  await request().get(`/api/public/${shareToken}/photos/${ids[0]}/thumb`).expect(404);
  await request().get(`/api/public/${shareToken}/photos/${ids[0]}/file`).expect(404);

  // Sharing again creates a different token; the old one stays dead.
  const again = (await agent.post(`/api/albums/${album.id}/share`).expect(200)).body.shareToken;
  assert.notEqual(again, shareToken);
  await request().get(`/api/public/${shareToken}`).expect(404);
  await request().get(`/api/public/${again}`).expect(200);
});

test('a public link only exposes its own album and never leaks other data', async () => {
  const { agent, request, ids, album } = await setup();
  await agent.post(`/api/albums/${album.id}/photos`).send({ photoIds: [ids[0]] });
  const { shareToken } = (await agent.post(`/api/albums/${album.id}/share`)).body;
  const body = (await request().get(`/api/public/${shareToken}`).expect(200)).body;
  assert.equal(JSON.stringify(body).includes('a@example.com'), false);
  await request().get('/api/public/short').expect(404);
  await request().get('/api/public/does-not-exist-0000000000').expect(404);
});

test('zip download contains the album photos and requires the owner', async () => {
  const { agent, request, ids, album } = await setup();
  await agent.post(`/api/albums/${album.id}/photos`).send({ photoIds: [ids[0], ids[1]] });
  await request().get(`/api/albums/${album.id}/zip`).expect(401);
  const res = await agent.get(`/api/albums/${album.id}/zip`).buffer(true).parse((r, cb) => {
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  }).expect(200);
  assert.match(res.headers['content-disposition'], /Trip\.zip/);
  assert.equal(res.body.subarray(0, 2).toString(), 'PK');
  const entries = res.body.toString('latin1').match(/PK\x03\x04/g) || [];
  assert.equal(entries.length, 2, 'only the two photos in the album are zipped');
});
