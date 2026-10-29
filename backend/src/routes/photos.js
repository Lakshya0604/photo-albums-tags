const express = require('express');
const multer = require('multer');
const store = require('../photoStore');
const { HttpError, normalizeTags, parseId } = require('../validate');

function photosRouter(db, config) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: config.maxFiles, fields: 5, fieldSize: 2048, parts: config.maxFiles + 5 },
  });

  async function ownPhoto(req) {
    const row = await db.photos.findOne({ _id: parseId(req.params.id, 'photo id'), userId: req.user.id });
    if (!row) throw new HttpError(404, 'Photo not found.');
    return row;
  }

  router.get('/', async (req, res) => {
    const tags = req.query.tags ? normalizeTags(String(req.query.tags)) : [];
    const match = req.query.match === 'any' ? 'any' : 'all';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    res.json({ photos: await store.listPhotos(db, req.user.id, { tags, match, order }) });
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
    const incoming = req.files.reduce((n, f) => n + f.size, 0);
    if ((await store.totalStoredBytes(db)) + incoming > config.maxTotalMb * 1024 * 1024) {
      throw new HttpError(507, 'The demo storage is full. Delete some photos and try again.');
    }
    const created = [];
    const errors = [];
    for (const file of req.files) {
      const result = await store.savePhoto(db, config, req.user.id, file);
      if (result.error) { errors.push(result.error); continue; }
      if (tags.length) await store.setTags(db, result.id, tags);
      created.push(result.id);
    }
    if (!created.length) throw new HttpError(400, errors.join(' '));
    const photos = await store.listPhotos(db, req.user.id, { photoIds: created });
    res.status(201).json({ photos, errors });
  });

  router.put('/:id/tags', async (req, res) => {
    const row = await ownPhoto(req);
    if (!Array.isArray(req.body?.tags)) throw new HttpError(400, 'Tags must be a list.');
    await store.setTags(db, row._id, normalizeTags(req.body.tags));
    const [photo] = await store.listPhotos(db, req.user.id, { photoIds: [row._id] });
    res.json({ photo });
  });

  router.delete('/:id', async (req, res) => {
    const row = await ownPhoto(req);
    await db.photos.deleteOne({ _id: row._id });
    // a deleted photo also leaves every album and stops being a cover
    await db.albums.updateMany({ photoIds: row._id }, { $pull: { photoIds: row._id } });
    await db.albums.updateMany({ coverPhotoId: row._id }, { $set: { coverPhotoId: null } });
    await store.removeBlobs(db, row);
    res.json({ ok: true });
  });

  router.get('/:id/thumb', async (req, res) => {
    const row = await ownPhoto(req);
    res.set('Cache-Control', 'private, max-age=3600');
    store.sendBlob(db.thumbs, row.thumbId, res, 'image/jpeg');
  });

  router.get('/:id/file', async (req, res) => {
    const row = await ownPhoto(req);
    res.set('Cache-Control', 'private, max-age=3600');
    store.sendBlob(db.originals, row.originalId, res, row.mime);
  });

  return router;
}
module.exports = { photosRouter };
