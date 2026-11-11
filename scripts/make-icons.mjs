// Makes the app icons from assets/bake-away-logo.jpg. Run once ("npm run icons") and commit the results;
// the release workflow does not run this.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'assets/bake-away-logo.jpg';
const OUT = 'public';
mkdirSync(`${OUT}/brand`, { recursive: true });

// The artwork sits inside a wide white margin; crop a square close to it.
const crop = { left: 60, top: 20, width: 1160, height: 1160 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

const square = () => sharp(SRC).extract(crop);

await square().resize(180, 180).png().toFile(`${OUT}/apple-touch-icon.png`);
await square().resize(192, 192).png().toFile(`${OUT}/icon-192.png`);
await square().resize(512, 512).png().toFile(`${OUT}/icon-512.png`);
await square().resize(32, 32).png().toFile(`${OUT}/favicon-32.png`);
// Maskable: phones may cut the icon to a circle, so keep the artwork inside the middle 80%.
await sharp(SRC)
  .resize(410, 410)
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: WHITE })
  .png()
  .toFile(`${OUT}/icon-maskable-512.png`);
// In-app logo (sign-in page, Home, menu).
await square().resize(640, 640).jpeg({ quality: 88 }).toFile(`${OUT}/brand/logo.jpg`);
// Cupcake only, for small places (menu header).
await sharp(SRC).extract({ left: 300, top: 140, width: 720, height: 720 }).resize(256, 256).png().toFile(`${OUT}/brand/mark.png`);

// Print the logo's colours so the theme can match them.
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const at = (x, y) => {
  const i = (y * info.width + x) * info.channels;
  return '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
};
console.log({
  pink: at(600, 420),
  pink2: at(500, 560),
  cream: at(640, 470),
  cherry: at(740, 300),
  caramel: at(450, 660),
  chocolateText: at(300, 850),
  taglinePink: at(323, 1000),
  wrapperCream: at(700, 760),
});
