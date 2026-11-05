import sharp from 'sharp';

// Eight-tone, Bayer 8×8 ordered dithering. Keep photo.png as the source.
const bayer = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
];
const side = 96;
const portrait = sharp('public/photo.png')
  .rotate()
  .extract({ left: 64, top: 160, width: 960, height: 960 });
// The reveal layer uses exactly the same crop, with the original colors intact.
await portrait
  .clone()
  .resize(384, 384)
  .webp({ quality: 85 })
  .toFile('public/photo-color.webp');
const source = await portrait
  .clone()
  .resize(side, side)
  .normalise()
  .grayscale()
  .linear(1.18, -23)
  .raw()
  .toBuffer();
const lightMask = Buffer.alloc(side * side * 4, 255);
const darkMask = Buffer.alloc(side * side * 4, 255);
for (let y = 0; y < side; y++) {
  for (let x = 0; x < side; x++) {
    const threshold = (bayer[y % 8][x % 8] + 0.5) / 64 - 0.5;
    const level =
      Math.max(
        0,
        Math.min(7, Math.round((source[y * side + x] / 255) * 7 + threshold)),
      ) / 7;
    // Only transparency is baked in. The UI supplies the actual theme colors.
    const alpha = Math.round(level * 255);
    darkMask[(y * side + x) * 4 + 3] = alpha;
    lightMask[(y * side + x) * 4 + 3] = 255 - alpha;
  }
}
for (const [theme, pixels] of [
  ['light', lightMask],
  ['dark', darkMask],
]) {
  await sharp(pixels, { raw: { width: side, height: side, channels: 4 } })
    .resize(384, 384, { kernel: 'nearest' })
    .png({ palette: true, colours: 8 })
    .toFile(`public/photo-mask-${theme}.png`);
}
console.log('Generated theme-aware portrait masks from public/photo.png');
