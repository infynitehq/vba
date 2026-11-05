import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Versioned release distribution, not /stable/ or /latest/.
const version = '4.2.3';
const files = JSON.parse(await readFile('emulator-files.json', 'utf8'));
const lockPath = 'scripts/emulator-integrity.json';
let lock = {};
try {
  lock = JSON.parse(await readFile(lockPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let total = 0;
for (const file of files) {
  const url = `https://cdn.emulatorjs.org/${version}/data/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  let bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (lock[file] && lock[file] !== hash)
    throw new Error(
      `Integrity mismatch: ${file}. Refusing changed release assets.`,
    );
  lock[file] = hash;
  if (file === 'emulator.min.js') {
    // Upstream checks the CDN on every launch, even offline. Keep its check local.
    const source = bytes.toString();
    const patched = source.replace(
      /(["'])https:\/\/cdn\.emulatorjs\.org\/stable\/data\/version\.json\1/g,
      'window.EJS_pathtodata+"version.json"',
    );
    if (patched === source)
      throw new Error('Upstream update-check patch no longer matches');
    bytes = Buffer.from(patched);
  }
  const target = `public/emulatorjs/${file}`;
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  await writeFile(target, bytes);
  total += bytes.length;
  console.log(`${file}: ${bytes.length.toLocaleString()} bytes`);
}
// Preserve upstream license with redistribution.
const license = await fetch(
  `https://raw.githubusercontent.com/EmulatorJS/EmulatorJS/v${version}/LICENSE`,
);
if (!license.ok) throw new Error('Could not fetch EmulatorJS license');
await writeFile('public/emulatorjs/LICENSE', await license.text());
await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(
  `EmulatorJS ${version}: ${(total / 1024 / 1024).toFixed(2)} MiB; GBA only, no ROMs or BIOS.`,
);
