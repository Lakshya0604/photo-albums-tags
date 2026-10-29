// Creates demo data: one demo user, 12 generated photos with EXIF dates and tags, 2 albums (one shared).
const bcrypt = require('bcryptjs');
const { openDb } = require('../src/db');
const { loadConfig } = require('../src/config');
const store = require('../src/photoStore');
const { makeJpeg } = require('../src/sampleImage');

const DEMO = { email: 'demo@example.com', password: 'demo12345' };
const SHARE_TOKEN = 'demo-shared-album-token-0001';

// [file name, palette, EXIF date taken (null = no EXIF), tags]
const PHOTOS = [
  ['beach-sunrise', 'sunrise', '2024:06:12 06:10:00', ['beach', 'summer']],
  ['beach-picnic', 'market', '2024:06:12 13:40:00', ['beach', 'summer', 'friends']],
  ['mountain-trail', 'forest', '2023:09:03 09:15:00', ['hiking', 'mountains']],
  ['summit-view', 'lake', '2023:09:03 12:30:00', ['hiking', 'mountains', 'friends']],
  ['city-night', 'night', '2022:12:31 23:50:00', ['city', 'night']],
  ['old-bridge', 'city', '2021:04:18 17:05:00', ['city']],
  ['lake-morning', 'lake', '2024:08:20 07:00:00', ['lake', 'summer']],
  ['campfire', 'night', '2024:08:20 21:30:00', ['lake', 'night', 'friends']],
  ['autumn-leaves', 'autumn', '2022:10:22 15:20:00', ['autumn']],
  ['snowy-cabin', 'snow', '2023:01:14 11:00:00', ['winter', 'mountains']],
  ['market-stall', 'market', '2021:11:05 10:10:00', ['city', 'food']],
  ['no-exif-date', 'forest', null, ['demo']],
];

async function seed(config = loadConfig(), existing = null) {
  const db = existing || (await openDb(config.mongoUri, config.mongoDb));
  try {
    if (await db.users.findOne({ email: DEMO.email })) {
      console.log('Demo data already exists. Drop the database to reseed.');
      return;
    }
    const userId = (await db.users.insertOne({ email: DEMO.email, passwordHash: await bcrypt.hash(DEMO.password, 10), createdAt: new Date() })).insertedId;
    const ids = [];
    for (const [i, [name, palette, takenAt, tags]] of PHOTOS.entries()) {
      const buffer = await makeJpeg({ palette, takenAt, seed: i + 1 });
      const res = await store.savePhoto(db, config, userId, { buffer, size: buffer.length, originalname: `${name}.jpg` });
      await store.setTags(db, res.id, tags);
      ids.push(res.id);
    }
    const mkAlbum = (name, photoIds, shareToken) => db.albums.insertOne({
      userId, name, coverPhotoId: photoIds[0], photoIds, createdAt: new Date(), ...(shareToken ? { shareToken } : {}),
    });
    await mkAlbum('Summer 2024', [ids[0], ids[1], ids[6], ids[7]], SHARE_TOKEN);
    await mkAlbum('Mountains', [ids[2], ids[3], ids[9]], null);
    console.log(`Seeded. Log in with ${DEMO.email} / ${DEMO.password}`);
    console.log(`Public demo album link: /s/${SHARE_TOKEN}`);
  } finally {
    if (!existing) await db.close();
  }
}

if (require.main === module) seed().catch((e) => { console.error(e); process.exit(1); });
module.exports = { seed, DEMO };
