const sharp = require('sharp');
const exifr = require('exifr');

const THUMB_SIZE = 320;
const MAX_PIXELS = 50_000_000; // rejects decompression bombs

const ALLOWED = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Real format check from the file bytes, not the client-supplied mime type.
async function inspect(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    return null;
  }
  if (!ALLOWED[meta.format]) return null;
  return { format: meta.format, mime: ALLOWED[meta.format], width: meta.width, height: meta.height };
}

async function makeThumbnail(buffer) {
  return sharp(buffer, { limitInputPixels: MAX_PIXELS })
    .rotate() // respect EXIF orientation
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
    .jpeg({ quality: 72 })
    .toBuffer();
}

// Date taken from EXIF (DateTimeOriginal, then CreateDate). Returns ISO string or null.
async function readTakenAt(buffer) {
  try {
    const data = await exifr.parse(buffer, ['DateTimeOriginal', 'CreateDate']);
    const d = data?.DateTimeOriginal || data?.CreateDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  } catch {
    // no readable EXIF: caller falls back to upload date
  }
  return null;
}

module.exports = { inspect, makeThumbnail, readTakenAt, THUMB_SIZE };
