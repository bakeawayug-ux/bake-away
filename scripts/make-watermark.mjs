// Makes the see-through cupcake used as the faint watermark behind the app (src/assets/watermark.png).
// The logo has a white background; white becomes transparent so no box shows behind the cupcake.
// Run once ("node scripts/make-watermark.mjs") and commit the result.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('src/assets', { recursive: true });
const { data, info } = await sharp('assets/bake-away-logo.jpg')
  .extract({ left: 300, top: 140, width: 720, height: 610 }) // the cupcake, without the lettering
  .resize({ width: 400 })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const lightest = Math.min(data[i], data[i + 1], data[i + 2]);
  // near-white -> clear; colours keep their full strength
  const a = Math.max(0, Math.min(255, (255 - lightest) * 3.2));
  data[i + 3] = a;
}

await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9, palette: true, quality: 80 }).toFile('src/assets/watermark.png');
console.log('src/assets/watermark.png written');
