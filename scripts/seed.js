// Creates demo data: one demo user, 12 generated photos with EXIF dates and tags, 2 albums (one shared).
const bcrypt = require('bcryptjs');
const { openDb } = require('../src/db');
const { loadConfig } = require('../src/config');
const store = require('../src/photoStore');
const { makeJpeg } = require('../src/sampleImage');

const DEMO = { email: 'demo@example.com', password: 'demo12345' };
const SHARE_TOKEN = 'demo-shared-album-token-0001';

const PHOTOS = [
  ['Beach sunrise', '#f97316', '2024:06:12 06:10:00', ['beach', 'summer']],
  ['Beach picnic', '#eab308', '2024:06:12 13:40:00', ['beach', 'summer', 'friends']],
  ['Mountain trail', '#16a34a', '2023:09:03 09:15:00', ['hiking', 'mountains']],
  ['Summit view', '#0ea5e9', '2023:09:03 12:30:00', ['hiking', 'mountains', 'friends']],
  ['City night', '#6366f1', '2022:12:31 23:50:00', ['city', 'night']],
  ['Old bridge', '#64748b', '2021:04:18 17:05:00', ['city']],
  ['Lake morning', '#14b8a6', '2024:08:20 07:00:00', ['lake', 'summer']],
  ['Campfire', '#dc2626', '2024:08:20 21:30:00', ['lake', 'night', 'friends']],
  ['Autumn leaves', '#b45309', '2022:10:22 15:20:00', ['autumn']],
  ['Snowy cabin', '#94a3b8', '2023:01:14 11:00:00', ['winter', 'mountains']],
  ['Market stall', '#db2777', '2021:11:05 10:10:00', ['city', 'food']],
  ['No EXIF date', '#7c3aed', null, ['demo']],
];

async function seed(config = loadConfig()) {
  const db = openDb(config.dataDir);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(DEMO.email)) {
    console.log('Demo data already exists. Delete the data folder to reseed.');
    return;
  }
  const user = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(DEMO.email, bcrypt.hashSync(DEMO.password, 10));
  const userId = Number(user.lastInsertRowid);
  const ids = [];
  for (const [label, color, takenAt, tags] of PHOTOS) {
    const buffer = await makeJpeg({ label, color, takenAt });
    const res = await store.savePhoto(db, config, userId, { buffer, size: buffer.length, originalname: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg` });
    store.setTags(db, res.id, tags);
    ids.push(res.id);
  }
  const mkAlbum = (name, photoIds, token) => {
    const a = db.prepare('INSERT INTO albums (user_id, name, cover_photo_id, share_token) VALUES (?, ?, ?, ?)').run(userId, name, photoIds[0], token);
    for (const p of photoIds) db.prepare('INSERT INTO album_photos (album_id, photo_id) VALUES (?, ?)').run(a.lastInsertRowid, p);
  };
  mkAlbum('Summer 2024', [ids[0], ids[1], ids[6], ids[7]], SHARE_TOKEN);
  mkAlbum('Mountains', [ids[2], ids[3], ids[9]], null);
  console.log(`Seeded. Log in with ${DEMO.email} / ${DEMO.password}`);
  console.log(`Public demo album link: /s/${SHARE_TOKEN}`);
}

if (require.main === module) seed().catch((e) => { console.error(e); process.exit(1); });
module.exports = { seed, DEMO };
