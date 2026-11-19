import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

// A static PNG works for link unfurlers without JavaScript or SVG support.
const logo = await readFile(
  new URL('../public/logo.svg', import.meta.url),
  'utf8',
);
const artwork = logo.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
if (!artwork) throw new Error('public/logo.svg must contain an SVG element');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#191715"/>
  <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="#3b3732"/>
  <svg x="68" y="62" width="56" height="56" viewBox="144 144 512 512" fill="#f5b85a">${artwork}</svg>
  <g font-family="monospace">
    <text x="140" y="100" fill="#eeeae3" font-size="26" font-weight="bold">Pocket GBA</text>
    <text x="72" y="238" fill="#eeeae3" font-size="58" font-weight="bold">Your own</text>
    <text x="72" y="310" fill="#f5b85a" font-size="58" font-weight="bold">GBA games.</text>
    <text x="74" y="375" fill="#b9b2a8" font-size="25">Offline, on your device.</text>
    <text x="74" y="437" fill="#b9b2a8" font-size="18">No account. No uploads. Just play.</text>
    <text x="74" y="551" fill="#f5b85a" font-size="19">vba.infynite.in</text>
    <text x="1126" y="551" text-anchor="end" fill="#8b847a" font-size="14">Bring your own games.</text>
  </g>
  <circle cx="924" cy="291" r="177" fill="#211e1a" stroke="#3b3732"/>
  <svg x="778" y="145" width="292" height="292" viewBox="144 144 512 512" fill="#f5b85a">${artwork}</svg>
  <path d="M74 493H1126" stroke="#3b3732"/>
</svg>`;

await sharp(Buffer.from(svg))
  .png()
  .toFile(new URL('../public/og-image.png', import.meta.url).pathname);
console.log('Generated public/og-image.png (1200 × 630)');
