import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  assetUrl,
  cli,
  distributionRepo,
  isMain,
  targets,
  versionFromTag,
  releaseEndpoint,
} from './release-utils.mjs';
import { filesUnder, fingerprint } from './collect-update-artifacts.mjs';
import { verifyUpdateSignature } from './update-signature.mjs';

export async function assemble({
  input,
  output,
  tag,
  repo,
  date = new Date().toISOString(),
  publicKey = process.env.DESKTOP_UPDATE_PUBLIC_KEY,
  endpoint = process.env.DESKTOP_UPDATE_ENDPOINT,
}) {
  const version = versionFromTag(tag);
  distributionRepo(repo);
  releaseEndpoint(repo, endpoint);
  if (!Number.isFinite(Date.parse(date)))
    throw new Error('Invalid publication date');
  const paths = await filesUnder(input);
  const byName = new Map();
  for (const path of paths) {
    const name = basename(path);
    if (byName.has(name))
      throw new Error(`Duplicate artifact filename: ${name}`);
    byName.set(name, path);
  }
  const platforms = {};
  const assets = [];
  const claimed = new Set();
  for (const path of paths.filter((file) => file.endsWith('.json'))) {
    const metadata = JSON.parse(await readFile(path, 'utf8'));
    const { target, archive, signatureFile, files } = metadata;
    if (!targets[target] || platforms[target])
      throw new Error(`Unknown or duplicate target: ${target}`);
    if (metadata.version !== version)
      throw new Error('Artifact version does not match release');
    const prefix = `Pocket-GBA_${version}_${target}`;
    const expected = [
      `${prefix}${targets[target].update}`,
      `${prefix}${targets[target].update}.sig`,
      ...targets[target].installers.map((suffix) => `${prefix}${suffix}`),
    ];
    if (
      archive !== expected[0] ||
      signatureFile !== expected[1] ||
      !Array.isArray(files) ||
      files.length !== expected.length
    )
      throw new Error(`Incomplete artifact set for ${target}`);
    const seen = new Set();
    for (const file of files) {
      if (
        !expected.includes(file.name) ||
        seen.has(file.name) ||
        claimed.has(file.name)
      )
        throw new Error('Duplicate or unexpected file in metadata');
      seen.add(file.name);
      claimed.add(file.name);
      const actualPath = byName.get(file.name);
      if (!actualPath) throw new Error(`Missing archive/asset: ${file.name}`);
      const actual = await fingerprint(actualPath);
      if (actual.size !== file.size || actual.sha256 !== file.sha256)
        throw new Error(`Artifact integrity mismatch: ${file.name}`);
      assets.push({ name: file.name, path: actualPath, ...actual });
    }
    const signature = (
      await readFile(byName.get(signatureFile), 'utf8')
    ).trim();
    verifyUpdateSignature(
      await readFile(byName.get(archive)),
      signature,
      publicKey,
      version,
    );
    platforms[target] = { signature, url: assetUrl(repo, tag, archive) };
  }
  if (Object.keys(platforms).length !== Object.keys(targets).length)
    throw new Error('All four updater targets are required');
  if (
    paths.some(
      (path) => !path.endsWith('.json') && !claimed.has(basename(path)),
    )
  )
    throw new Error('Unclaimed release artifact');
  const manifest = {
    version,
    notes: `Pocket GBA ${tag}`,
    pub_date: date,
    platforms,
  };
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length)
    throw new Error('Manifest output directory must be empty');
  // Prereleases can be inspected, but never supply the stable latest.json asset.
  const name = version.includes('-') ? 'prerelease.json' : 'latest.json';
  const manifestPath = join(output, name);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assets.push({
    name,
    path: manifestPath,
    ...(await fingerprint(manifestPath)),
  });
  await writeFile(
    join(output, 'release-assets.json'),
    `${JSON.stringify({ tag, repo, assets }, null, 2)}\n`,
  );
  return { manifest, assets };
}

if (isMain(import.meta.url))
  cli(() =>
    assemble({
      input: process.env.UPDATE_ARTIFACT_DIRECTORY,
      output: process.env.RELEASE_OUTPUT_DIRECTORY,
      tag: process.env.RELEASE_TAG,
      repo: process.env.DESKTOP_UPDATE_REPOSITORY,
    }),
  );
