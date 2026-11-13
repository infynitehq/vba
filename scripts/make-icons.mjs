import sharp from 'sharp';
import {
  readFile,
  mkdir,
  writeFile,
  mkdtemp,
  copyFile,
  rm,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function generateIcons({ desktop = false } = {}) {
  // Keep the uploaded logo untouched; fit the artwork inside the maskable safe area.
  const logo = await readFile(join(root, 'public/logo.svg'), 'utf8');
  const artwork = logo.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  if (!artwork) throw new Error('public/logo.svg must contain an SVG element');
  const content = `<rect width="512" height="512" fill="#191715"/><svg x="96" y="96" width="320" height="320" viewBox="144 144 512 512" fill="#f5b85a">${artwork}</svg>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${content}</svg>`;
  const roundedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><clipPath id="corners"><rect width="512" height="512" rx="112"/></clipPath></defs><g clip-path="url(#corners)">${content}</g></svg>`;
  await mkdir(join(root, 'public/icons'), { recursive: true });
  await writeFile(join(root, 'public/icons/source.svg'), roundedSvg);
  // Maskable and Apple touch icons need full-bleed backgrounds: the OS masks them.
  for (const [name, size, source] of [
    ['icon-192', 192, roundedSvg],
    ['icon-512', 512, roundedSvg],
    ['maskable-512', 512, svg],
    ['apple-touch-icon', 180, svg],
  ]) {
    await sharp(Buffer.from(source))
      .resize(size, size)
      .png()
      .toFile(join(root, `public/icons/${name}.png`));
  }
  console.log('Generated app icons from public/logo.svg');

  if (desktop) {
    // Tauri generates mobile/store assets too. Keep only our desktop build inputs.
    const temporary = await mkdtemp(join(tmpdir(), 'pocket-gba-icons-'));
    try {
      const cli = join(root, 'node_modules/@tauri-apps/cli/tauri.js');
      execFileSync(
        process.execPath,
        [
          cli,
          'icon',
          join(root, 'public/icons/icon-512.png'),
          '--output',
          temporary,
        ],
        { cwd: root, stdio: 'pipe' },
      );
      const config = JSON.parse(
        await readFile(join(root, 'desktop/tauri.conf.json'), 'utf8'),
      );
      await mkdir(join(root, 'desktop/icons'), { recursive: true });
      for (const icon of config.bundle.icon) {
        await copyFile(
          join(temporary, icon.slice('icons/'.length)),
          join(root, 'desktop', icon),
        );
      }
      console.log('Generated desktop icons from public/logo.svg');
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await generateIcons({ desktop: process.argv.includes('--desktop') });
}
