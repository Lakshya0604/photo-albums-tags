const express = require('express');
const store = require('../photoStore');
const { HttpError, parseId } = require('../validate');

// Public read-only access. Every request re-checks the share token in the database,
// so turning sharing off blocks the very next request. No caching is allowed for the same reason.
// Image bytes are streamed through this server, never from a public storage URL.
function publicRouter(db) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  async function sharedAlbum(token) {
    const album = typeof token === 'string' && token.length >= 16
      ? await db.albums.findOne({ shareToken: token })
      : null;
    if (!album) throw new HttpError(404, 'This link is not available.');
    return album;
  }

  async function photoInAlbum(album, rawId) {
    const id = parseId(rawId, 'photo id');
    if (!album.photoIds.some((p) => p.equals(id))) throw new HttpError(404, 'Photo not found.');
    const row = await db.photos.findOne({ _id: id });
    if (!row) throw new HttpError(404, 'Photo not found.');
    return row;
  }

  router.get('/:token', async (req, res) => {
    const album = await sharedAlbum(req.params.token);
    const photos = await store.listPhotos(db, album.userId, { photoIds: album.photoIds });
    res.json({
      album: { name: album.name, coverPhotoId: album.coverPhotoId?.toHexString() || photos[0]?.id || null },
      photos,
    });
  });

  router.get('/:token/photos/:id/thumb', async (req, res) => {
    const row = await photoInAlbum(await sharedAlbum(req.params.token), req.params.id);
    store.sendBlob(db.thumbs, row.thumbId, res, 'image/jpeg');
  });

  router.get('/:token/photos/:id/file', async (req, res) => {
    const row = await photoInAlbum(await sharedAlbum(req.params.token), req.params.id);
    store.sendBlob(db.originals, row.originalId, res, row.mime);
  });

  return router;
}
module.exports = { publicRouter };
