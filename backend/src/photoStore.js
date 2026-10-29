const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const images = require('./images');

async function putBuffer(bucket, filename, buffer, contentType) {
  const up = bucket.openUploadStream(filename, { contentType });
  await pipeline(Readable.from([buffer]), up);
  return up.id;
}

async function totalStoredBytes(db) {
  const r = await db.photos.aggregate([{ $group: { _id: null, bytes: { $sum: '$size' } } }]).toArray();
  return r[0]?.bytes || 0;
}

// Saves the original and the server-made thumbnail to GridFS, then records the photo.
async function savePhoto(db, config, userId, file) {
  const info = await images.inspect(file.buffer);
  if (!info) return { error: `${file.originalname}: not a valid JPEG, PNG or WebP image.` };
  let thumb;
  try {
    thumb = await images.makeThumbnail(file.buffer);
  } catch {
    return { error: `${file.originalname}: could not process this image.` };
  }
  const takenAt = await images.readTakenAt(file.buffer);
  const uploadedAt = new Date().toISOString();
  const name = file.originalname.slice(0, 200);

  let originalId;
  let thumbId;
  try {
    originalId = await putBuffer(db.originals, name, file.buffer, info.mime);
    thumbId = await putBuffer(db.thumbs, name, thumb, 'image/jpeg');
    const doc = {
      userId, originalName: name, mime: info.mime, size: file.size, width: info.width, height: info.height,
      takenAt, uploadedAt, sortDate: takenAt || uploadedAt, tags: [], originalId, thumbId,
    };
    const r = await db.photos.insertOne(doc);
    return { id: r.insertedId };
  } catch (err) {
    // do not leave orphan blobs when a later step fails
    await Promise.allSettled([originalId && db.originals.delete(originalId), thumbId && db.thumbs.delete(thumbId)]);
    throw err;
  }
}

function setTags(db, photoId, tags) {
  return db.photos.updateOne({ _id: photoId }, { $set: { tags: [...tags].sort() } });
}

function publicPhoto(r) {
  return {
    id: r._id.toHexString(),
    name: r.originalName,
    width: r.width,
    height: r.height,
    takenAt: r.takenAt,
    uploadedAt: r.uploadedAt,
    dateSource: r.takenAt ? 'exif' : 'upload',
    tags: r.tags || [],
  };
}

// Photos of one user, optionally filtered by tags (match=all|any), sorted by date taken
// (EXIF) with upload date as the fallback (sortDate holds whichever applies).
async function listPhotos(db, userId, { tags = [], match = 'all', order = 'desc', photoIds = null } = {}) {
  const filter = { userId };
  if (photoIds) filter._id = { $in: photoIds };
  if (tags.length) filter.tags = match === 'any' ? { $in: tags } : { $all: tags };
  const dir = order === 'asc' ? 1 : -1;
  const rows = await db.photos.find(filter).sort({ sortDate: dir, _id: dir }).toArray();
  return rows.map(publicPhoto);
}

async function removeBlobs(db, row) {
  await Promise.allSettled([db.originals.delete(row.originalId), db.thumbs.delete(row.thumbId)]);
}

// Streams a GridFS file to the response; ends the request cleanly if the blob is gone.
function sendBlob(bucket, id, res, contentType) {
  res.type(contentType);
  const stream = bucket.openDownloadStream(id);
  stream.on('error', () => { if (!res.headersSent) res.status(404).json({ error: 'File not found.' }); else res.destroy(); });
  stream.pipe(res);
}

module.exports = { savePhoto, setTags, listPhotos, publicPhoto, removeBlobs, sendBlob, totalStoredBytes };
