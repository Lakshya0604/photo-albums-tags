const express = require('express');
const crypto = require('crypto');
const { ZipArchive } = require('archiver');
const path = require('path');
const store = require('../photoStore');
const { HttpError, validateName, parseId, parseIdList, normalizeTags } = require('../validate');

function albumsRouter(db) {
  const router = express.Router();

  async function ownAlbum(req) {
    const row = await db.albums.findOne({ _id: parseId(req.params.id, 'album id'), userId: req.user.id });
    if (!row) throw new HttpError(404, 'Album not found.');
    return row;
  }

  // Cover falls back to the newest photo of the album when none is chosen.
  async function albumJson(a) {
    let cover = a.coverPhotoId;
    if (!cover && a.photoIds.length) {
      const first = await db.photos.find({ _id: { $in: a.photoIds } }).sort({ sortDate: -1 }).limit(1).next();
      cover = first?._id || null;
    }
    return {
      id: a._id.toHexString(),
      name: a.name,
      coverPhotoId: cover ? cover.toHexString() : null,
      shared: !!a.shareToken,
      shareToken: a.shareToken || null,
      photoCount: a.photoIds.length,
    };
  }

  const fresh = (id) => db.albums.findOne({ _id: id });

  router.get('/', async (req, res) => {
    const rows = await db.albums.find({ userId: req.user.id }).sort({ _id: -1 }).toArray();
    res.json({ albums: await Promise.all(rows.map(albumJson)) });
  });

  router.post('/', async (req, res) => {
    const name = validateName(req.body?.name, 'Album name');
    const doc = { userId: req.user.id, name, coverPhotoId: null, photoIds: [], createdAt: new Date() };
    const r = await db.albums.insertOne(doc);
    res.status(201).json({ album: await albumJson({ ...doc, _id: r.insertedId }) });
  });

  router.get('/:id', async (req, res) => {
    const album = await ownAlbum(req);
    const tags = req.query.tags ? normalizeTags(String(req.query.tags)) : [];
    const photos = await store.listPhotos(db, req.user.id, {
      photoIds: album.photoIds, tags, match: req.query.match === 'any' ? 'any' : 'all', order: req.query.order === 'asc' ? 'asc' : 'desc',
    });
    res.json({ album: await albumJson(album), photos });
  });

  router.patch('/:id', async (req, res) => {
    const album = await ownAlbum(req);
    const body = req.body || {};
    if (body.name === undefined && body.coverPhotoId === undefined) throw new HttpError(400, 'Nothing to update.');
    const set = {};
    if (body.name !== undefined) set.name = validateName(body.name, 'Album name');
    if (body.coverPhotoId !== undefined) {
      const coverId = body.coverPhotoId === null ? null : parseId(body.coverPhotoId, 'cover photo id');
      if (coverId && !album.photoIds.some((p) => p.equals(coverId))) {
        throw new HttpError(400, 'The cover must be a photo that is in this album.');
      }
      set.coverPhotoId = coverId;
    }
    await db.albums.updateOne({ _id: album._id }, { $set: set });
    res.json({ album: await albumJson(await fresh(album._id)) });
  });

  router.delete('/:id', async (req, res) => {
    const album = await ownAlbum(req);
    await db.albums.deleteOne({ _id: album._id });
    res.json({ ok: true });
  });

  router.post('/:id/photos', async (req, res) => {
    const album = await ownAlbum(req);
    const ids = parseIdList(req.body?.photoIds);
    const owned = await db.photos.countDocuments({ userId: req.user.id, _id: { $in: ids } });
    if (owned !== ids.length) throw new HttpError(400, 'One or more photos were not found.');
    await db.albums.updateOne({ _id: album._id }, { $addToSet: { photoIds: { $each: ids } } });
    res.json({ album: await albumJson(await fresh(album._id)) });
  });

  router.delete('/:id/photos/:photoId', async (req, res) => {
    const album = await ownAlbum(req);
    const photoId = parseId(req.params.photoId, 'photo id');
    await db.albums.updateOne({ _id: album._id }, { $pull: { photoIds: photoId } });
    if (album.coverPhotoId?.equals(photoId)) await db.albums.updateOne({ _id: album._id }, { $set: { coverPhotoId: null } });
    res.json({ ok: true });
  });

  // Public sharing: a random token. Removing it makes every public URL fail on the next request.
  router.post('/:id/share', async (req, res) => {
    const album = await ownAlbum(req);
    const token = album.shareToken || crypto.randomBytes(18).toString('base64url');
    await db.albums.updateOne({ _id: album._id }, { $set: { shareToken: token } });
    res.json({ shareToken: token, sharePath: `/s/${token}` });
  });

  router.delete('/:id/share', async (req, res) => {
    const album = await ownAlbum(req);
    await db.albums.updateOne({ _id: album._id }, { $unset: { shareToken: '' } });
    res.json({ ok: true });
  });

  router.get('/:id/zip', async (req, res) => {
    const album = await ownAlbum(req);
    const rows = await db.photos.find({ _id: { $in: album.photoIds } }).sort({ sortDate: 1 }).toArray();
    const safe = album.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'album';
    res.attachment(`${safe}.zip`);
    const zip = new ZipArchive({ store: true });
    zip.on('error', () => res.destroy());
    zip.pipe(res);
    const used = new Set();
    for (const r of rows) {
      let name = path.basename(r.originalName).replace(/[\\/]/g, '_') || r._id.toHexString();
      while (used.has(name)) name = `${r._id.toHexString().slice(-6)}-${name}`;
      used.add(name);
      zip.append(db.originals.openDownloadStream(r.originalId), { name });
    }
    await zip.finalize();
  });

  return router;
}
module.exports = { albumsRouter };
