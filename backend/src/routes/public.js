const express = require('express');
const path = require('path');
const store = require('../photoStore');
const { HttpError, parseId } = require('../validate');

// Public read-only access. Every request re-checks the share token in the database,
// so turning sharing off blocks the very next request. No caching is allowed for the same reason.
function publicRouter(db, config) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  function sharedAlbum(token) {
    const album = typeof token === 'string' && token.length >= 16
      ? db.prepare('SELECT * FROM albums WHERE share_token = ?').get(token)
      : null;
    if (!album) throw new HttpError(404, 'This link is not available.');
    return album;
  }

  function photoInAlbum(album, rawId) {
    const row = db.prepare(
      'SELECT p.* FROM album_photos ap JOIN photos p ON p.id = ap.photo_id WHERE ap.album_id = ? AND p.id = ?'
    ).get(album.id, parseId(rawId, 'photo id'));
    if (!row) throw new HttpError(404, 'Photo not found.');
    return row;
  }

  router.get('/:token', (req, res) => {
    const album = sharedAlbum(req.params.token);
    const rows = db.prepare(
      'SELECT p.* FROM album_photos ap JOIN photos p ON p.id = ap.photo_id WHERE ap.album_id = ? ORDER BY p.sort_date DESC, p.id DESC'
    ).all(album.id);
    const photos = store.attachTags(db, rows).map(store.publicPhoto);
    res.json({ album: { name: album.name, coverPhotoId: album.cover_photo_id || photos[0]?.id || null }, photos });
  });

  router.get('/:token/photos/:id/thumb', (req, res) => {
    const row = photoInAlbum(sharedAlbum(req.params.token), req.params.id);
    res.type('image/jpeg').sendFile(path.join(store.dirs(config).thumbs, row.thumb_name));
  });

  router.get('/:token/photos/:id/file', (req, res) => {
    const row = photoInAlbum(sharedAlbum(req.params.token), req.params.id);
    res.type(row.mime).sendFile(path.join(store.dirs(config).originals, row.stored_name));
  });

  return router;
}
module.exports = { publicRouter };
