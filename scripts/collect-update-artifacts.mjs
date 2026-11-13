import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { cli, isMain, targets, versionFromTag } from './release-utils.mjs';
import { verifyUpdateSignature } from './update-signature.mjs';

export async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed: ${path}`);
    if (entry.isDirectory()) {
      // An app bundle is not an upload artifact; only its signed tar archive is.
      if (!entry.name.endsWith('.app')) files.push(...(await filesUnder(path)));
    } else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function fingerprint(path) {
  const data = await readFile(path);
  if (!data.length) throw new Error(`Empty artifact: ${path}`);
  return {
    size: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

export async function collect({
  source,
  output,
  target,
  tag,
  publicKey = process.env.DESKTOP_UPDATE_PUBLIC_KEY,
}) {
  const version = versionFromTag(tag);
  const platform = targets[target];
  if (!platform) throw new Error(`Unknown target: ${target}`);
  if (resolve(output).startsWith(`${resolve(source)}/`))
    throw new Error('Output must be outside the bundle directory');
  const candidates = await filesUnder(source);
  const one = (suffix) => {
    const found = candidates.filter((file) => file.endsWith(suffix));
    if (found.length !== 1)
      throw new Error(
        `Expected exactly one ${suffix} for ${target}, found ${found.length}`,
      );
    return found[0];
  };
  const update = one(platform.update);
  const signaturePath = `${update}.sig`;
  if (!(await stat(signaturePath)).isFile())
    throw new Error('Missing updater signature');
  const signature = (await readFile(signaturePath, 'utf8')).trim();
  verifyUpdateSignature(await readFile(update), signature, publicKey, version);
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length)
    throw new Error('Artifact output must be empty');
  const files = [];
  const save = async (sourcePath, suffix) => {
    const name = `Pocket-GBA_${version}_${target}${suffix}`;
    await copyFile(sourcePath, join(output, name));
    files.push({ name, ...(await fingerprint(join(output, name))) });
    return name;
  };
  const archive = await save(update, platform.update);
  const signatureFile = await save(signaturePath, `${platform.update}.sig`);
  for (const suffix of platform.installers) await save(one(suffix), suffix);
  const metadata = { version, target, archive, signatureFile, files };
  await writeFile(
    join(output, `${target}.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
}

if (isMain(import.meta.url))
  cli(() =>
    collect({
      source: process.env.BUNDLE_DIRECTORY,
      output: process.env.UPDATE_ARTIFACT_DIRECTORY,
      target: process.env.UPDATE_TARGET,
      tag: process.env.RELEASE_TAG,
    }),
  );
