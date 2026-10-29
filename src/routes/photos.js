const express = require('express');
const multer = require('multer');
const path = require('path');
const store = require('../photoStore');
const { HttpError, normalizeTags, parseId } = require('../validate');

function photosRouter(db, config) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: config.maxFiles },
  });

  function ownPhoto(req) {
    const row = db.prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?').get(parseId(req.params.id, 'photo id'), req.user.id);
    if (!row) throw new HttpError(404, 'Photo not found.');
    return row;
  }

  router.get('/', (req, res) => {
    const tags = req.query.tags ? normalizeTags(String(req.query.tags)) : [];
    const match = req.query.match === 'any' ? 'any' : 'all';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    res.json({ photos: store.listPhotos(db, req.user.id, { tags, match, order }) });
  });

  router.post('/', (req, res, next) => {
    upload.array('photos', config.maxFiles)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? `A file is larger than ${config.maxUploadMb} MB.`
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `Upload at most ${config.maxFiles} photos at once.`
          : 'Upload failed.';
        return next(new HttpError(400, msg));
      }
      next(err);
    });
  }, async (req, res) => {
    if (!req.files?.length) throw new HttpError(400, 'Choose at least one photo to upload.');
    const tags = req.body.tags ? normalizeTags(String(req.body.tags)) : [];
    const created = [];
    const errors = [];
    for (const file of req.files) {
      const result = await store.savePhoto(db, config, req.user.id, file);
      if (result.error) { errors.push(result.error); continue; }
      if (tags.length) store.setTags(db, result.id, tags);
      created.push(result.id);
    }
    if (!created.length) throw new HttpError(400, errors.join(' '));
    const photos = store.listPhotos(db, req.user.id).filter((p) => created.includes(p.id));
    res.status(201).json({ photos, errors });
  });

  router.put('/:id/tags', (req, res) => {
    const row = ownPhoto(req);
    store.setTags(db, row.id, normalizeTags(req.body?.tags));
    res.json({ photo: store.listPhotos(db, req.user.id).find((p) => p.id === row.id) });
  });

  router.delete('/:id', (req, res) => {
    const row = ownPhoto(req);
    db.prepare('DELETE FROM photos WHERE id = ?').run(row.id);
    store.removeFiles(config, row);
    res.json({ ok: true });
  });

  router.get('/:id/thumb', (req, res) => {
    const row = ownPhoto(req);
    res.set('Cache-Control', 'private, max-age=3600').type('image/jpeg')
      .sendFile(path.join(store.dirs(config).thumbs, row.thumb_name));
  });

  router.get('/:id/file', (req, res) => {
    const row = ownPhoto(req);
    res.set('Cache-Control', 'private, max-age=3600').type(row.mime)
      .sendFile(path.join(store.dirs(config).originals, row.stored_name));
  });

  return router;
}
module.exports = { photosRouter };
