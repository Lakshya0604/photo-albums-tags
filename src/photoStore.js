const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const images = require('./images');

function dirs(config) {
  const base = path.join(config.dataDir, 'uploads');
  const originals = path.join(base, 'originals');
  const thumbs = path.join(base, 'thumbs');
  fs.mkdirSync(originals, { recursive: true });
  fs.mkdirSync(thumbs, { recursive: true });
  return { originals, thumbs };
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Saves the original, generates the server-side thumbnail, records the photo.
async function savePhoto(db, config, userId, file) {
  const info = await images.inspect(file.buffer);
  if (!info) return { error: `${file.originalname}: not a valid JPEG, PNG or WebP image.` };

  const id = crypto.randomBytes(12).toString('hex');
  const storedName = `${id}.${EXT[info.mime]}`;
  const thumbName = `${id}.jpg`;
  const d = dirs(config);

  const thumb = await images.makeThumbnail(file.buffer);
  fs.writeFileSync(path.join(d.originals, storedName), file.buffer);
  fs.writeFileSync(path.join(d.thumbs, thumbName), thumb);

  const takenAt = await images.readTakenAt(file.buffer);
  const uploadedAt = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO photos (user_id, original_name, stored_name, thumb_name, mime, size, width, height, taken_at, uploaded_at, sort_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(userId, file.originalname.slice(0, 200), storedName, thumbName, info.mime, file.size, info.width, info.height, takenAt, uploadedAt, takenAt || uploadedAt);
  return { id: Number(row.lastInsertRowid) };
}

function setTags(db, photoId, tags) {
  const del = db.prepare('DELETE FROM photo_tags WHERE photo_id = ?');
  const ins = db.prepare('INSERT INTO photo_tags (photo_id, tag) VALUES (?, ?)');
  db.transaction(() => {
    del.run(photoId);
    for (const t of tags) ins.run(photoId, t);
  })();
}

function attachTags(db, rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const tags = db.prepare(`SELECT photo_id, tag FROM photo_tags WHERE photo_id IN (${marks}) ORDER BY tag`).all(...ids);
  const map = new Map();
  for (const t of tags) {
    if (!map.has(t.photo_id)) map.set(t.photo_id, []);
    map.get(t.photo_id).push(t.tag);
  }
  return rows.map((r) => ({ ...r, tags: map.get(r.id) || [] }));
}

function publicPhoto(r) {
  return {
    id: r.id,
    name: r.original_name,
    width: r.width,
    height: r.height,
    takenAt: r.taken_at,
    uploadedAt: r.uploaded_at,
    dateSource: r.taken_at ? 'exif' : 'upload',
    tags: r.tags || [],
  };
}

// Photos of one user, optionally filtered by tags (match=all|any), sorted by date taken.
function listPhotos(db, userId, { tags = [], match = 'all', order = 'desc', albumId = null } = {}) {
  const params = [userId];
  let sql = 'SELECT p.* FROM photos p';
  if (albumId) {
    sql += ' JOIN album_photos ap ON ap.photo_id = p.id AND ap.album_id = ?';
    params.unshift(albumId);
  }
  sql += ' WHERE p.user_id = ?';
  if (tags.length) {
    const marks = tags.map(() => '?').join(',');
    const need = match === 'any' ? 1 : tags.length;
    sql += ` AND (SELECT COUNT(DISTINCT tag) FROM photo_tags t WHERE t.photo_id = p.id AND t.tag IN (${marks})) >= ?`;
    params.push(...tags, need);
  }
  sql += ` ORDER BY p.sort_date ${order === 'asc' ? 'ASC' : 'DESC'}, p.id ${order === 'asc' ? 'ASC' : 'DESC'}`;
  return attachTags(db, db.prepare(sql).all(...params)).map(publicPhoto);
}

function removeFiles(config, row) {
  const d = dirs(config);
  fs.rmSync(path.join(d.originals, row.stored_name), { force: true });
  fs.rmSync(path.join(d.thumbs, row.thumb_name), { force: true });
}

module.exports = { savePhoto, setTags, listPhotos, attachTags, publicPhoto, removeFiles, dirs };
