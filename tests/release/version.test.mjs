import { strict as assert } from 'node:assert';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  checkVersions,
  setVersion,
  validVersion,
} from '../../scripts/release-version.mjs';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'pocket-gba-version-'));
  mkdirSync(join(root, 'desktop'));
  writeFileSync(join(root, 'package.json'), '{\n  "version": "0.1.0"\n}\n');
  writeFileSync(
    join(root, 'desktop/tauri.conf.json'),
    '{\n  "version": "0.1.0",\n  "identifier": "app.pocketgba.desktop"\n}\n',
  );
  writeFileSync(
    join(root, 'desktop/Cargo.toml'),
    '[package]\nname = "pocket-gba"\nversion = "0.1.0"\nrust-version = "1.90"\n\n[dependencies]\nexample = { version = "9.0.0" }\n',
  );
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts stable and prerelease SemVer, rejects ambiguous versions', () => {
  for (const value of ['0.2.0', '1.0.0-beta.1', '2.3.4+build.01'])
    assert.equal(validVersion(value), true, value);
  for (const value of [
    'v0.2.0',
    '01.2.3',
    '1.2',
    '1.2.3-beta.01',
    '1.2.3-beta..1',
    '1.2.3+build..1',
    '1.2.3\n',
  ])
    assert.equal(validVersion(value), false, value);
});

test('updates all application versions without changing identifiers or dependencies', () =>
  fixture((root) => {
    assert.equal(setVersion('0.2.0', root), '0.2.0');
    assert.equal(checkVersions(root, 'v0.2.0'), '0.2.0');
    const config = JSON.parse(
      readFileSync(join(root, 'desktop/tauri.conf.json'), 'utf8'),
    );
    assert.equal(config.identifier, 'app.pocketgba.desktop');
    const cargo = readFileSync(join(root, 'desktop/Cargo.toml'), 'utf8');
    assert.match(cargo, /rust-version = "1.90"/);
    assert.match(cargo, /example = \{ version = "9.0.0" \}/);
  }));

test('checks never write and reject mismatched versions and tags', () =>
  fixture((root) => {
    const path = join(root, 'desktop/tauri.conf.json');
    const before = readFileSync(path, 'utf8');
    assert.throws(() => checkVersions(root, 'v0.1.1'), /exactly match/);
    assert.equal(readFileSync(path, 'utf8'), before);
    writeFileSync(path, before.replace('0.1.0', '0.2.0'));
    assert.throws(() => checkVersions(root), /Version mismatch/);
  }));

test('invalid versions or malformed configuration cannot partially bump files', () =>
  fixture((root) => {
    const packagePath = join(root, 'package.json');
    const before = readFileSync(packagePath, 'utf8');
    assert.throws(() => setVersion('invalid', root), /Invalid SemVer/);
    writeFileSync(join(root, 'desktop/tauri.conf.json'), '{broken');
    assert.throws(() => setVersion('0.2.0', root));
    assert.equal(readFileSync(packagePath, 'utf8'), before);
  }));
