const express = require('express');
const crypto = require('crypto');
const { ZipArchive } = require('archiver');
const path = require('path');
const store = require('../photoStore');
const { HttpError, validateName, parseId, parseIdList, normalizeTags } = require('../validate');

function albumsRouter(db, config) {
  const router = express.Router();

  function ownAlbum(req) {
    const row = db.prepare('SELECT * FROM albums WHERE id = ? AND user_id = ?').get(parseId(req.params.id, 'album id'), req.user.id);
    if (!row) throw new HttpError(404, 'Album not found.');
    return row;
  }

  const albumJson = (a) => ({
    id: a.id,
    name: a.name,
    coverPhotoId: a.cover_photo_id,
    shared: !!a.share_token,
    shareToken: a.share_token || null,
    photoCount: db.prepare('SELECT COUNT(*) c FROM album_photos WHERE album_id = ?').get(a.id).c,
  });

  // Cover falls back to the first photo of the album when none is chosen.
  function withCover(a) {
    const j = albumJson(a);
    if (!j.coverPhotoId) {
      const first = db.prepare(
        'SELECT p.id FROM album_photos ap JOIN photos p ON p.id = ap.photo_id WHERE ap.album_id = ? ORDER BY p.sort_date DESC LIMIT 1'
      ).get(a.id);
      j.coverPhotoId = first?.id ?? null;
    }
    return j;
  }

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM albums WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
    res.json({ albums: rows.map(withCover) });
  });

  router.post('/', (req, res) => {
    const name = validateName(req.body?.name, 'Album name');
    const info = db.prepare('INSERT INTO albums (user_id, name) VALUES (?, ?)').run(req.user.id, name);
    res.status(201).json({ album: withCover(db.prepare('SELECT * FROM albums WHERE id = ?').get(info.lastInsertRowid)) });
  });

  router.get('/:id', (req, res) => {
    const album = ownAlbum(req);
    const tags = req.query.tags ? normalizeTags(String(req.query.tags)) : [];
    const photos = store.listPhotos(db, req.user.id, {
      albumId: album.id, tags, match: req.query.match === 'any' ? 'any' : 'all', order: req.query.order === 'asc' ? 'asc' : 'desc',
    });
    res.json({ album: withCover(album), photos });
  });

  router.patch('/:id', (req, res) => {
    const album = ownAlbum(req);
    const body = req.body || {};
    if (body.name === undefined && body.coverPhotoId === undefined) throw new HttpError(400, 'Nothing to update.');
    if (body.name !== undefined) {
      db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(validateName(body.name, 'Album name'), album.id);
    }
    if (body.coverPhotoId !== undefined) {
      const coverId = body.coverPhotoId === null ? null : parseId(body.coverPhotoId, 'cover photo id');
      if (coverId && !db.prepare('SELECT 1 FROM album_photos WHERE album_id = ? AND photo_id = ?').get(album.id, coverId)) {
        throw new HttpError(400, 'The cover must be a photo that is in this album.');
      }
      db.prepare('UPDATE albums SET cover_photo_id = ? WHERE id = ?').run(coverId, album.id);
    }
    res.json({ album: withCover(db.prepare('SELECT * FROM albums WHERE id = ?').get(album.id)) });
  });

  router.delete('/:id', (req, res) => {
    const album = ownAlbum(req);
    db.prepare('DELETE FROM albums WHERE id = ?').run(album.id);
    res.json({ ok: true });
  });

  router.post('/:id/photos', (req, res) => {
    const album = ownAlbum(req);
    const ids = parseIdList(req.body?.photoIds);
    const owned = db.prepare(`SELECT id FROM photos WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`).all(req.user.id, ...ids);
    if (owned.length !== ids.length) throw new HttpError(400, 'One or more photos were not found.');
    const ins = db.prepare('INSERT OR IGNORE INTO album_photos (album_id, photo_id) VALUES (?, ?)');
    db.transaction(() => ids.forEach((id) => ins.run(album.id, id)))();
    res.json({ album: withCover(album) });
  });

  router.delete('/:id/photos/:photoId', (req, res) => {
    const album = ownAlbum(req);
    const photoId = parseId(req.params.photoId, 'photo id');
    db.prepare('DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?').run(album.id, photoId);
    if (album.cover_photo_id === photoId) db.prepare('UPDATE albums SET cover_photo_id = NULL WHERE id = ?').run(album.id);
    res.json({ ok: true });
  });

  // Public sharing: a random token. Removing it makes every public URL fail on the next request.
  router.post('/:id/share', (req, res) => {
    const album = ownAlbum(req);
    const token = album.share_token || crypto.randomBytes(18).toString('base64url');
    db.prepare('UPDATE albums SET share_token = ? WHERE id = ?').run(token, album.id);
    res.json({ shareToken: token, sharePath: `/s/${token}` });
  });

  router.delete('/:id/share', (req, res) => {
    const album = ownAlbum(req);
    db.prepare('UPDATE albums SET share_token = NULL WHERE id = ?').run(album.id);
    res.json({ ok: true });
  });

  router.get('/:id/zip', (req, res) => {
    const album = ownAlbum(req);
    const rows = db.prepare(
      'SELECT p.* FROM album_photos ap JOIN photos p ON p.id = ap.photo_id WHERE ap.album_id = ? ORDER BY p.sort_date'
    ).all(album.id);
    const safe = album.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'album';
    res.attachment(`${safe}.zip`);
    const zip = new ZipArchive({ store: true });
    zip.on('error', () => res.destroy());
    zip.pipe(res);
    const used = new Set();
    for (const r of rows) {
      let name = path.basename(r.original_name).replace(/[\\/]/g, '_') || r.stored_name;
      while (used.has(name)) name = `${r.id}-${name}`;
      used.add(name);
      zip.file(path.join(store.dirs(config).originals, r.stored_name), { name });
    }
    zip.finalize();
  });

  return router;
}
module.exports = { albumsRouter };
