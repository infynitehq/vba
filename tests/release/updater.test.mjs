import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  updaterConfig,
  writeUpdaterConfig,
} from '../../scripts/updater-config.mjs';
import {
  collect,
  fingerprint,
} from '../../scripts/collect-update-artifacts.mjs';
import { assemble } from '../../scripts/make-update-manifest.mjs';
import { verifyDraft } from '../../scripts/stage-update-release.mjs';
import {
  validateSignatureVersion,
  verifyUpdateSignature,
} from '../../scripts/update-signature.mjs';
import {
  assetUrl,
  distributionRepo,
  publicHttps,
  targets,
  versionFromTag,
  releaseEndpoint,
} from '../../scripts/release-utils.mjs';

const tag = 'v1.2.3';
// Ephemeral unit-test keys only; never persisted or used for a release.
const keyPair = generateKeyPairSync('ed25519');
const keyId = Buffer.alloc(8, 7);
const keyPacket = Buffer.concat([
  Buffer.from('Ed'),
  keyId,
  keyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
]).toString('base64');
const publicKey = Buffer.from(
  `untrusted comment: minisign public key: TEST FIXTURE\n${keyPacket}\n`,
).toString('base64');
const env = {
  DESKTOP_UPDATE_PUBLIC_KEY: publicKey,
  DESKTOP_UPDATE_REPOSITORY: 'example/public',
  DESKTOP_UPDATE_ENDPOINT:
    'https://github.com/example/public/releases/latest/download/latest.json',
  TAURI_SIGNING_PRIVATE_KEY: 'synthetic-test-fixture',
};

function signatureFixture(
  version,
  target = 'test',
  extra = '',
  data = Buffer.from(`artifact for ${target}`),
  pair = keyPair,
  algorithm = 'ED',
) {
  const comment = `timestamp:1\tfile:${target}${version === undefined ? '' : `\tversion:${version}`}${extra}`;
  const message =
    algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data;
  const signature = sign(null, message, pair.privateKey);
  const packet = Buffer.concat([Buffer.from(algorithm), keyId, signature]);
  const globalSignature = sign(
    null,
    Buffer.concat([signature, Buffer.from(comment)]),
    pair.privateKey,
  );
  return Buffer.from(
    [
      'untrusted comment: unit-test signature fixture',
      packet.toString('base64'),
      `trusted comment: ${comment}`,
      globalSignature.toString('base64'),
    ].join('\n'),
  ).toString('base64');
}

test('signature trusted comment must bind exactly one matching release version', () => {
  const valid = signatureFixture('1.2.3');
  assert.equal(validateSignatureVersion(valid, '1.2.3'), valid);
  assert.ok(validateSignatureVersion(signatureFixture('v1.2.3'), '1.2.3'));
  for (const signature of [
    signatureFixture(undefined),
    signatureFixture(''),
    signatureFixture('1.2.4'),
    signatureFixture('1.2.3', 'test', '\tversion:1.2.3'),
    signatureFixture(undefined, 'version:1.2.3.zip'),
    'not a signature',
  ])
    assert.throws(
      () => validateSignatureVersion(signature, '1.2.3'),
      /signature/,
    );
});

test('crypto verifier checks payload, key ID, signer, global comment, and signed version', () => {
  const data = Buffer.from('artifact for test');
  const signature = signatureFixture('1.2.3');
  assert.equal(
    verifyUpdateSignature(data, signature, publicKey, '1.2.3'),
    signature,
  );
  assert.ok(
    verifyUpdateSignature(
      data,
      signatureFixture('1.2.3', 'test', '', data, keyPair, 'Ed'),
      publicKey,
      '1.2.3',
    ),
  );
  assert.throws(
    () =>
      verifyUpdateSignature(
        Buffer.from('altered'),
        signature,
        publicKey,
        '1.2.3',
      ),
    /artifact signature/,
  );
  const otherPair = generateKeyPairSync('ed25519');
  const wrongSigner = signatureFixture('1.2.3', 'test', '', data, otherPair);
  assert.throws(
    () => verifyUpdateSignature(data, wrongSigner, publicKey, '1.2.3'),
    /artifact signature/,
  );
  const changed = Buffer.from(signature, 'base64')
    .toString()
    .replace('version:1.2.3', 'version:9.9.9');
  assert.throws(
    () =>
      verifyUpdateSignature(
        data,
        Buffer.from(changed).toString('base64'),
        publicKey,
        '9.9.9',
      ),
    /trusted comment signature/,
  );
  const changedKey = Buffer.from(publicKey, 'base64').toString().split('\n');
  const packet = Buffer.from(changedKey[1], 'base64');
  packet[2] ^= 1;
  changedKey[1] = packet.toString('base64');
  assert.throws(
    () =>
      verifyUpdateSignature(
        data,
        signature,
        Buffer.from(changedKey.join('\n')).toString('base64'),
        '1.2.3',
      ),
    /key ID/,
  );
  assert.throws(
    () =>
      verifyUpdateSignature(
        data,
        signatureFixture(undefined),
        publicKey,
        '1.2.3',
      ),
    /signed version/,
  );
  assert.throws(
    () =>
      verifyUpdateSignature(
        data,
        signatureFixture('9.9.9'),
        publicKey,
        '1.2.3',
      ),
    /signed version/,
  );
  assert.throws(
    () => verifyUpdateSignature(data, `${signature}!`, publicKey, '1.2.3'),
    /base64/,
  );
});

test('cross-check against Tauri CLI-produced payload vector in updater 2.14.1', () => {
  // Public throwaway test vector from tauri-plugin-updater 2.14.1 offline_tests;
  // its upstream comment records `tauri signer sign --app-version 2.0.0`.
  const pub =
    'untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe';
  const sig =
    'untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==';
  assert.ok(
    verifyUpdateSignature(
      Buffer.from('test'),
      Buffer.from(sig).toString('base64'),
      Buffer.from(pub).toString('base64'),
      '2.0.0',
    ),
  );
  assert.throws(
    () =>
      verifyUpdateSignature(
        Buffer.from('tampered'),
        Buffer.from(sig).toString('base64'),
        Buffer.from(pub).toString('base64'),
        '2.0.0',
      ),
    /artifact signature/,
  );
});

test('collection rejects legacy or mismatched signed versions before copying', async (t) => {
  const root = await temporary(t);
  const source = join(root, 'bundle');
  await mkdir(source);
  await writeFile(join(source, 'app.exe'), 'installer');
  for (const version of [undefined, '9.9.9']) {
    await writeFile(
      join(source, 'app.exe.sig'),
      signatureFixture(version, 'test', '', Buffer.from('installer')),
    );
    await assert.rejects(
      collect({
        source,
        output: join(root, 'out'),
        target: 'windows-x86_64',
        tag,
        publicKey,
      }),
      /signed version/,
    );
  }
});

test('assembly rechecks signed versions even when metadata hashes are consistent', async (t) => {
  const { input, options } = await fixture(t);
  const directory = join(input, 'windows-x86_64');
  const metadataPath = join(directory, 'windows-x86_64.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  for (const version of [undefined, '9.9.9']) {
    const signaturePath = join(directory, metadata.signatureFile);
    await writeFile(signaturePath, signatureFixture(version, 'windows-x86_64'));
    Object.assign(
      metadata.files.find((file) => file.name === metadata.signatureFile),
      await fingerprint(signaturePath),
    );
    await writeFile(metadataPath, JSON.stringify(metadata));
    await assert.rejects(assemble(options), /signed version/);
  }
});

test('collection and assembly fail closed on wrong keys or cryptographic tampering', async (t) => {
  const { input, options, root } = await fixture(t);
  const target = 'windows-x86_64';
  const directory = join(input, target);
  const metadataPath = join(directory, `${target}.json`);
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const archive = join(directory, metadata.archive);
  await writeFile(archive, 'changed artifact with updated metadata');
  Object.assign(
    metadata.files.find((file) => file.name === metadata.archive),
    await fingerprint(archive),
  );
  await writeFile(metadataPath, JSON.stringify(metadata));
  await assert.rejects(assemble(options), /artifact signature/);
  const source = join(root, 'wrong-key-bundle');
  await mkdir(source);
  const data = Buffer.from('installer');
  await writeFile(join(source, 'app.exe'), data);
  await writeFile(
    join(source, 'app.exe.sig'),
    signatureFixture('1.2.3', target, '', data, generateKeyPairSync('ed25519')),
  );
  await assert.rejects(
    collect({
      source,
      output: join(root, 'wrong-key-output'),
      target,
      tag,
      publicKey,
    }),
    /artifact signature/,
  );
});

async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'pocket-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function fixture(t, releaseTag = tag) {
  const root = await temporary(t);
  const input = join(root, 'collected');
  await mkdir(input);
  for (const [target, platform] of Object.entries(targets)) {
    const source = join(root, 'bundle', target);
    await mkdir(source, { recursive: true });
    const original = `Pocket GBA${platform.update}`; // Both Mac targets deliberately have the same original filename.
    await writeFile(join(source, original), `artifact for ${target}`);
    await writeFile(
      join(source, `${original}.sig`),
      `${signatureFixture(releaseTag.slice(1), target)}\n`,
    );
    for (const suffix of platform.installers)
      await writeFile(
        join(source, `installer${suffix}`),
        `installer ${target}`,
      );
    await collect({
      source,
      output: join(input, target),
      target,
      tag: releaseTag,
      publicKey,
    });
  }
  const options = {
    input,
    output: join(root, 'output'),
    tag: releaseTag,
    repo: 'example/public',
    publicKey,
    endpoint: env.DESKTOP_UPDATE_ENDPOINT,
  };
  return { root, input, options };
}

test('production config requires actual configured key, endpoint, and private signing input', async (t) => {
  assert.deepEqual(updaterConfig(env), {
    plugins: {
      updater: {
        pubkey: publicKey,
        endpoints: [env.DESKTOP_UPDATE_ENDPOINT],
        requireSignedVersion: true,
      },
    },
    bundle: { createUpdaterArtifacts: true },
  });
  for (const key of Object.keys(env))
    assert.throws(() => updaterConfig({ ...env, [key]: '' }));
  assert.throws(() =>
    updaterConfig({ ...env, DESKTOP_UPDATE_PUBLIC_KEY: 'dummy' }),
  );
  assert.throws(() =>
    updaterConfig({ ...env, DESKTOP_UPDATE_PUBLIC_KEY: keyPacket }),
  );
  const root = await temporary(t);
  const path = await writeUpdaterConfig({ ...env, RUNNER_TEMP: root });
  assert.deepEqual(
    JSON.parse(await readFile(path, 'utf8')),
    updaterConfig(env),
  );
  assert.ok(
    !String(await readFile(path)).includes(env.TAURI_SIGNING_PRIVATE_KEY),
  );
});

test('URLs must be public HTTPS with no authentication or token query', () => {
  for (const url of [
    'http://example.com/a',
    'https://user:secret@example.com/a',
    'https://example.com/a?token=secret',
    'https://localhost/a',
    'https://127.0.0.1/a',
    'https://[::1]/a',
    'https://host.internal/a',
    'https://example.com/a#secret',
  ]) {
    assert.throws(() => publicHttps(url), url);
  }
  assert.equal(
    assetUrl('example/public', tag, 'Pocket GBA.app.tar.gz'),
    'https://github.com/example/public/releases/download/v1.2.3/Pocket%20GBA.app.tar.gz',
  );
  for (const repo of ['', '-flag', 'owner/repo/other', 'owner/..'])
    assert.throws(() => distributionRepo(repo));
  assert.equal(
    releaseEndpoint('example/public', env.DESKTOP_UPDATE_ENDPOINT),
    env.DESKTOP_UPDATE_ENDPOINT,
  );
  for (const endpoint of [
    'https://github.com/other/public/releases/latest/download/latest.json',
    'https://github.com/example/public/releases/download/v1.2.3/latest.json',
    'https://github.com/example/public/releases/latest/download/prerelease.json',
    'https://example.com/latest.json',
  ])
    assert.throws(
      () => releaseEndpoint('example/public', endpoint),
      /DESKTOP_UPDATE_ENDPOINT/,
    );
});

test('stable and prerelease tags are explicit, no arbitrary command strings', () => {
  assert.equal(versionFromTag(tag), '1.2.3');
  assert.equal(versionFromTag('v1.2.3-beta.1'), '1.2.3-beta.1');
  for (const invalid of [
    '1.2.3',
    'v01.2.3',
    'v1.2.3;echo hi',
    'v1.2.3-beta.01',
  ])
    assert.throws(() => versionFromTag(invalid));
});

test('all four platforms produce a single feed with signature CONTENT and unique immutable asset URLs', async (t) => {
  const { options } = await fixture(t);
  const { manifest, assets } = await assemble(options);
  assert.equal(manifest.version, '1.2.3');
  assert.deepEqual(
    Object.keys(manifest.platforms).sort(),
    Object.keys(targets).sort(),
  );
  assert.equal(assets.length, 12); // 11 binary/signature assets plus one feed.
  assert.equal(new Set(assets.map((a) => a.name)).size, assets.length);
  for (const [target, platform] of Object.entries(manifest.platforms)) {
    assert.equal(platform.signature, signatureFixture('1.2.3', target));
    assert.ok(platform.url.includes(`/v1.2.3/Pocket-GBA_1.2.3_${target}`));
  }
  assert.ok(await readFile(join(options.output, 'latest.json')));
});

test('prerelease builds never emit latest.json', async (t) => {
  const { options } = await fixture(t, 'v1.2.3-beta.1');
  const { assets } = await assemble(options);
  assert.ok(assets.some((a) => a.name === 'prerelease.json'));
  assert.ok(!assets.some((a) => a.name === 'latest.json'));
});

test('missing targets, duplicate filenames, missing archives, tampering fail closed', async (t) => {
  await t.test('missing target', async (t) => {
    const { input, options } = await fixture(t);
    await rm(join(input, 'darwin-aarch64'), { recursive: true });
    await assert.rejects(assemble(options), /four/);
  });
  await t.test('duplicate files', async (t) => {
    const { input, options } = await fixture(t);
    await cp(join(input, 'darwin-aarch64'), join(input, 'duplicate'), {
      recursive: true,
    });
    await assert.rejects(assemble(options), /Duplicate artifact/);
  });
  await t.test('missing archive', async (t) => {
    const { input, options } = await fixture(t);
    await rm(
      join(
        input,
        'darwin-aarch64',
        'Pocket-GBA_1.2.3_darwin-aarch64.app.tar.gz',
      ),
    );
    await assert.rejects(assemble(options), /Missing archive/);
  });
  await t.test('tampering', async (t) => {
    const { input, options } = await fixture(t);
    await writeFile(
      join(
        input,
        'darwin-aarch64',
        'Pocket-GBA_1.2.3_darwin-aarch64.app.tar.gz',
      ),
      'tampered',
    );
    await assert.rejects(assemble(options), /integrity mismatch/);
  });
  await t.test('duplicate target', async (t) => {
    const { input, options } = await fixture(t);
    const metadata = join(input, 'darwin-aarch64', 'darwin-aarch64.json');
    await cp(metadata, join(input, 'other.json'));
    await assert.rejects(assemble(options), /duplicate target/);
  });
});

test('collection rejects missing signatures and ambiguous archives', async (t) => {
  const root = await temporary(t);
  const source = join(root, 'bundle');
  await mkdir(source);
  await writeFile(join(source, 'a.exe'), 'installer');
  const options = {
    source,
    output: join(root, 'out'),
    target: 'windows-x86_64',
    tag,
  };
  await assert.rejects(collect(options));
  await writeFile(join(source, 'a.exe.sig'), '');
  await assert.rejects(collect(options), /signature/);
  await writeFile(join(source, 'b.exe'), 'installer');
  await assert.rejects(collect(options), /exactly one/);
});

test('staged publication proof requires draft, channel and every asset hash/size', () => {
  const assets = [{ name: 'latest.json', size: 123, sha256: 'abc' }];
  const release = {
    draft: true,
    tag_name: tag,
    prerelease: false,
    assets: [
      {
        name: 'latest.json',
        size: 123,
        state: 'uploaded',
        digest: 'sha256:abc',
      },
    ],
  };
  verifyDraft(release, assets, tag);
  assert.throws(() => verifyDraft({ ...release, draft: false }, assets, tag));
  assert.throws(() =>
    verifyDraft({ ...release, prerelease: true }, assets, tag),
  );
  assert.throws(() => verifyDraft({ ...release, assets: [] }, assets, tag));
  assert.throws(() =>
    verifyDraft(
      { ...release, assets: [{ ...release.assets[0], digest: null }] },
      assets,
      tag,
    ),
  );
  assert.throws(() =>
    verifyDraft(
      { ...release, assets: [...release.assets, ...release.assets] },
      assets,
      tag,
    ),
  );
});
