// Renders the app icons in public/icons/ from the approved icon: option 2 of design/canvas/Icone.dc.html,
// "Disco no limão" (a black record on lime). The PNG files are committed, so the app does not need sharp to run.
// Run it again (npm run icons) only when the icon changes, and then bump CACHE_NAME in public/sw.js: the icons keep
// their file names, so the service worker would otherwise go on serving the copies it already keeps.
//
//   icon-192.png, icon-512.png   the icon as designed, with its rounded corners (manifest purpose "any")
//   icon-maskable-512.png        full bleed, for Android to cut into the shape of the phone (purpose "maskable")
//   apple-touch-icon.png         full bleed 180x180: iOS rounds the corners itself and paints transparent ones black

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const LIME = '#C8FF2E';

// The record and its label, copied as they are from the canvas (its 160 px version, in a 100 x 100 box).
const RECORD = [
  '<circle cx="50" cy="50" r="33" fill="#0E0E10"/>',
  '<circle cx="50" cy="50" r="26" fill="none" stroke="#3A3A42" stroke-width="1.2"/>',
  '<circle cx="50" cy="50" r="19" fill="none" stroke="#3A3A42" stroke-width="1.2"/>',
  '<circle cx="50" cy="50" r="10" fill="#C8FF2E"/>',
  '<circle cx="50" cy="50" r="2.5" fill="#0E0E10"/>',
  '<path d="M29 38A24 24 0 0 1 42 25" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.35"/>',
].join('');
const RECORD_RADIUS = 33;

// Android may cut a maskable icon to a circle, and only the circle in the middle with a radius of 40% of the icon is
// sure to show. The record is far enough inside it, so the maskable icon is the same drawing on a full lime square.
const SAFE_ZONE_RADIUS = 40;
if (RECORD_RADIUS > SAFE_ZONE_RADIUS) throw new Error('The record does not fit in the maskable safe zone.');

function svg(size, { rounded }) {
  const corner = rounded ? ' rx="22"' : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
    `<rect width="100" height="100"${corner} fill="${LIME}"/>${RECORD}</svg>`
  );
}

const ICONS = [
  { file: 'icon-192.png', size: 192, rounded: true },
  { file: 'icon-512.png', size: 512, rounded: true },
  { file: 'icon-maskable-512.png', size: 512, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, rounded: false },
];

await mkdir(OUT_DIR, { recursive: true });
for (const { file, size, rounded } of ICONS) {
  await sharp(Buffer.from(svg(size, { rounded })))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, file));
  console.log(`public/icons/${file} (${size}x${size})`);
}
