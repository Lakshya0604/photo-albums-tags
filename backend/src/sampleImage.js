const sharp = require('sharp');

// Generates a small scenic JPEG (sky, sun, hills), optionally with an EXIF "date taken"
// ("YYYY:MM:DD HH:MM:SS"). Used by the seed script and the tests, so no binary files are committed.
const PALETTES = {
  sunrise: { sky: ['#fde68a', '#fb923c'], sun: '#fff7ed', hills: ['#7c2d12', '#9a3412', '#431407'] },
  forest: { sky: ['#bae6fd', '#e0f2fe'], sun: '#fef9c3', hills: ['#166534', '#15803d', '#14532d'] },
  night: { sky: ['#1e1b4b', '#4338ca'], sun: '#e0e7ff', hills: ['#0f172a', '#1e293b', '#020617'] },
  lake: { sky: ['#a5f3fc', '#f0f9ff'], sun: '#ffffff', hills: ['#0e7490', '#0891b2', '#155e75'] },
  autumn: { sky: ['#fed7aa', '#fef3c7'], sun: '#fffbeb', hills: ['#b45309', '#c2410c', '#78350f'] },
  snow: { sky: ['#cbd5e1', '#f1f5f9'], sun: '#ffffff', hills: ['#94a3b8', '#cbd5e1', '#64748b'] },
  city: { sky: ['#c7d2fe', '#fbcfe8'], sun: '#fff1f2', hills: ['#4338ca', '#6366f1', '#312e81'] },
  market: { sky: ['#fbcfe8', '#fde68a'], sun: '#fff1f2', hills: ['#be185d', '#db2777', '#831843'] },
};

async function makeJpeg({ width = 1200, height = 800, palette = 'forest', takenAt = null, seed = 1 } = {}) {
  const p = PALETTES[palette] || PALETTES.forest;
  const w = width;
  const h = height;
  const shift = (seed * 97) % 200;
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <circle cx="${w * (0.25 + (seed % 5) * 0.12)}" cy="${h * 0.3}" r="${h * 0.09}" fill="${p.sun}" opacity="0.95"/>
      <path d="M0 ${h * 0.62} Q ${w * 0.25} ${h * 0.4 + shift / 4} ${w * 0.5} ${h * 0.6} T ${w} ${h * 0.55} V ${h} H0Z" fill="${p.hills[0]}"/>
      <path d="M0 ${h * 0.75} Q ${w * 0.3} ${h * 0.55} ${w * 0.6} ${h * 0.74} T ${w} ${h * 0.7} V ${h} H0Z" fill="${p.hills[1]}"/>
      <path d="M0 ${h * 0.88} Q ${w * 0.4} ${h * 0.72 - shift / 6} ${w * 0.75} ${h * 0.87} T ${w} ${h * 0.84} V ${h} H0Z" fill="${p.hills[2]}"/>
    </svg>`
  );
  let img = sharp(svg).jpeg({ quality: 85 });
  if (takenAt) img = img.withExif({ IFD2: { DateTimeOriginal: takenAt } });
  return img.toBuffer();
}
module.exports = { makeJpeg };
