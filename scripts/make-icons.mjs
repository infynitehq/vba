import sharp from 'sharp';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
// Keep the uploaded logo untouched; fit the artwork inside the maskable safe area.
const logo = await readFile('public/logo.svg', 'utf8');
const artwork = logo.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
if (!artwork) throw new Error('public/logo.svg must contain an SVG element');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#191715"/><svg x="96" y="96" width="320" height="320" viewBox="144 144 512 512" fill="#f5b85a">${artwork}</svg></svg>`;
await mkdir('public/icons', { recursive: true });
await writeFile('public/icons/source.svg', svg);
for (const [name, size] of [
  ['icon-192', 192],
  ['icon-512', 512],
  ['maskable-512', 512],
  ['apple-touch-icon', 180],
]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/${name}.png`);
}
console.log('Generated app icons from public/logo.svg');
