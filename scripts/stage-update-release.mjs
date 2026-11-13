import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  cli,
  distributionRepo,
  isMain,
  versionFromTag,
} from './release-utils.mjs';
import { fingerprint } from './collect-update-artifacts.mjs';

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function verifyDraft(release, expected, tag) {
  if (
    !release.draft ||
    release.tag_name !== tag ||
    release.prerelease !== versionFromTag(tag).includes('-')
  )
    throw new Error('Release must remain a correctly classified draft');
  const actual = new Map();
  for (const asset of release.assets) {
    if (actual.has(asset.name)) throw new Error('Duplicate remote asset');
    actual.set(asset.name, asset);
  }
  if (actual.size !== expected.length)
    throw new Error('Remote release asset count mismatch');
  for (const asset of expected) {
    const remote = actual.get(asset.name);
    if (
      !remote ||
      remote.size !== asset.size ||
      remote.state !== 'uploaded' ||
      remote.digest !== `sha256:${asset.sha256}`
    )
      throw new Error(
        `Remote asset missing or integrity unproven: ${asset.name}`,
      );
  }
}

export function releaseNotes(tag, platformSigned = 'false') {
  versionFromTag(tag);
  if (!['true', 'false'].includes(platformSigned))
    throw new Error('PLATFORM_SIGNED must be true or false');
  return [
    `Pocket GBA ${tag}`,
    '',
    'DRAFT — not approved for publication. All four updater targets assembled.',
    'All update payloads have version-bound cryptographic updater signatures.',
    ...(platformSigned === 'true'
      ? [
          'macOS Developer ID signed/notarized; Windows Authenticode signed; Linux has updater signatures only.',
        ]
      : [
          'No paid OS signing: macOS is not Developer ID signed or notarized; Windows installers are not Authenticode signed.',
          'Gatekeeper, SmartScreen, antivirus, or managed-device policies may warn or block installation. Updater signatures do not bypass OS security checks.',
          'Only approve installation if you trust this release. Never disable system security globally.',
        ]),
    'Before manual publication: verify signatures, source/legal checklist, clean install and N→N+1 updater QA in docs/updates.md.',
    'Publishing this draft exposes its feed to installed clients. Never publish until the approval checklist is complete.',
  ].join('\n');
}

export async function stage(indexPath) {
  const { tag, repo, assets } = JSON.parse(await readFile(indexPath, 'utf8'));
  const version = versionFromTag(tag);
  const notesText = releaseNotes(tag, process.env.PLATFORM_SIGNED);
  distributionRepo(repo);
  const repository = JSON.parse(gh(['api', `repos/${repo}`]));
  if (repository.private || repository.visibility !== 'public')
    throw new Error('Distribution repository must be public');
  const names = new Set();
  for (const asset of assets) {
    if (basename(asset.path) !== asset.name || names.has(asset.name))
      throw new Error('Invalid asset index');
    names.add(asset.name);
    const actual = await fingerprint(asset.path);
    if (actual.sha256 !== asset.sha256 || actual.size !== asset.size)
      throw new Error('Asset changed before upload');
  }
  const required = version.includes('-') ? 'prerelease.json' : 'latest.json';
  if (
    !names.has(required) ||
    (version.includes('-') && names.has('latest.json'))
  )
    throw new Error('Wrong release channel manifest');
  const notes = join(process.env.RELEASE_OUTPUT_DIRECTORY, 'RELEASE-NOTES.txt');
  await writeFile(notes, notesText);
  // No --clobber, no edit, and no publish: an existing release is an error.
  gh([
    'release',
    'create',
    tag,
    '--repo',
    repo,
    '--draft',
    '--verify-tag',
    ...(version.includes('-') ? ['--prerelease'] : []),
    '--title',
    `Pocket GBA ${tag}`,
    '--notes-file',
    notes,
    ...assets.map((asset) => asset.path),
  ]);
  const release = JSON.parse(
    gh(['api', `repos/${repo}/releases/tags/${encodeURIComponent(tag)}`]),
  );
  verifyDraft(release, assets, tag);
  await writeFile(
    join(process.env.RELEASE_OUTPUT_DIRECTORY, 'draft-verification.json'),
    `${JSON.stringify({ tag, repo, draft: true, verified: true, assets }, null, 2)}\n`,
  );
}

if (isMain(import.meta.url)) cli(() => stage(process.argv[2]));
