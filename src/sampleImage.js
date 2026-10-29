const sharp = require('sharp');

// Generates a small colored JPEG, optionally with an EXIF "date taken" ("YYYY:MM:DD HH:MM:SS").
// Used by the seed script and the tests, so no binary fixtures are committed.
async function makeJpeg({ width = 1200, height = 800, color = '#3b82f6', label = '', takenAt = null } = {}) {
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${color}"/>
      <circle cx="${width * 0.7}" cy="${height * 0.35}" r="${height * 0.18}" fill="rgba(255,255,255,0.35)"/>
      <text x="40" y="${height - 50}" font-size="${Math.round(height / 9)}" font-family="sans-serif" fill="white">${label}</text>
    </svg>`
  );
  let img = sharp(svg).jpeg({ quality: 85 });
  if (takenAt) img = img.withExif({ IFD2: { DateTimeOriginal: takenAt } });
  return img.toBuffer();
}
module.exports = { makeJpeg };
