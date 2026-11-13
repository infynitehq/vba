import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { releaseOptions } from '../../scripts/release-options.mjs';
import { releaseNotes } from '../../scripts/stage-update-release.mjs';

test('tag releases default to free updater signing without paid OS signing', () => {
  assert.deepEqual(releaseOptions({ RELEASE_EVENT: 'push' }), {
    sign: false,
    updater: true,
  });
  // Manual-only options cannot turn off update verification for a tag release.
  assert.deepEqual(
    releaseOptions({
      RELEASE_EVENT: 'push',
      PLATFORM_SIGN_REQUESTED: 'true',
      UPDATER_REQUESTED: 'false',
    }),
    { sign: false, updater: true },
  );
});

test('tag releases can explicitly opt into OS signing without changing updater signing', () => {
  assert.deepEqual(
    releaseOptions({
      RELEASE_EVENT: 'push',
      DESKTOP_PLATFORM_SIGNING: 'true',
    }),
    { sign: true, updater: true },
  );
});

test('manual releases default to a free updater-enabled draft', () => {
  assert.deepEqual(releaseOptions({ RELEASE_EVENT: 'workflow_dispatch' }), {
    sign: false,
    updater: true,
  });
});

test('manual OS signing and update signing are independent in all four combinations', () => {
  for (const sign of [false, true])
    for (const updater of [false, true])
      assert.deepEqual(
        releaseOptions({
          RELEASE_EVENT: 'workflow_dispatch',
          PLATFORM_SIGN_REQUESTED: String(sign),
          UPDATER_REQUESTED: String(updater),
        }),
        { sign, updater },
      );
});

test('invalid signing options and unrelated events fail closed', () => {
  assert.throws(
    () => releaseOptions({ RELEASE_EVENT: 'pull_request' }),
    /tag push or manual dispatch/,
  );
  for (const env of [
    { RELEASE_EVENT: 'push', DESKTOP_PLATFORM_SIGNING: 'yes' },
    { RELEASE_EVENT: 'workflow_dispatch', PLATFORM_SIGN_REQUESTED: 'yes' },
    { RELEASE_EVENT: 'workflow_dispatch', UPDATER_REQUESTED: 'yes' },
  ])
    assert.throws(() => releaseOptions(env), /must be true or false/);
});

test('default draft notes disclose OS warnings without claiming paid OS signing', () => {
  const notes = releaseNotes('v0.2.0');
  assert.match(notes, /version-bound cryptographic updater signatures/);
  assert.match(notes, /not Developer ID signed or notarized/);
  assert.match(notes, /not Authenticode signed/);
  assert.match(notes, /Gatekeeper, SmartScreen/);
  assert.match(notes, /Never disable system security globally/);
  assert.doesNotMatch(notes, /macOS Developer ID signed\/notarized/);
});

test('OS-signed draft notes only claim OS signing when explicitly enabled', () => {
  assert.match(
    releaseNotes('v0.2.0', 'true'),
    /macOS Developer ID signed\/notarized; Windows Authenticode signed/,
  );
  assert.throws(() => releaseNotes('v0.2.0', 'yes'), /must be true or false/);
});

test('workflow wiring gates draft publication on updater signing, not paid certificates', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/desktop-release.yml', import.meta.url),
    'utf8',
  );
  assert.match(
    workflow,
    /node scripts\/release-options\.mjs >> "\$GITHUB_OUTPUT"/,
  );
  assert.match(
    workflow,
    /updater: \$\{\{ needs\.validate\.outputs\.updater == 'true' \}\}/,
  );
  assert.match(
    workflow,
    /draft:\n\s+if: needs\.validate\.outputs\.updater == 'true'/,
  );
  assert.match(workflow, /^\s+environment: release$/m);
  assert.match(
    workflow,
    /PLATFORM_SIGNED: \$\{\{ needs\.validate\.outputs\.sign \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /updater: \$\{\{ needs\.validate\.outputs\.sign/,
  );
  const build = await readFile(
    new URL('../../.github/workflows/desktop-build.yml', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(build, /Updater builds require platform signing/);
  assert.match(
    build,
    /environment: \$\{\{ \(inputs\.sign \|\| inputs\.updater\) && 'release' \|\| '' \}\}/,
  );
  assert.match(
    build,
    /if: \$\{\{ !inputs\.sign \|\| runner\.os == 'Linux' \}\}/,
  );
  assert.match(
    build,
    /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ inputs\.updater && secrets\.TAURI_SIGNING_PRIVATE_KEY/,
  );
  assert.match(build, /if: \$\{\{ inputs\.sign && runner\.os == 'macOS' \}\}/);
  assert.match(
    build,
    /if: \$\{\{ inputs\.sign && runner\.os == 'Windows' \}\}/,
  );
});
