import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, isMain, releaseEndpoint } from './release-utils.mjs';
import { decodePublicKey } from './update-signature.mjs';

export function updaterConfig(env = process.env) {
  const pubkey = env.DESKTOP_UPDATE_PUBLIC_KEY?.trim();
  decodePublicKey(pubkey);
  if (!env.TAURI_SIGNING_PRIVATE_KEY?.trim())
    throw new Error(
      'TAURI_SIGNING_PRIVATE_KEY is required for updater-enabled builds',
    );
  if (!env.DESKTOP_UPDATE_ENDPOINT)
    throw new Error('DESKTOP_UPDATE_ENDPOINT is required');
  return {
    plugins: {
      updater: {
        pubkey,
        endpoints: [
          releaseEndpoint(
            env.DESKTOP_UPDATE_REPOSITORY,
            env.DESKTOP_UPDATE_ENDPOINT,
          ),
        ],
        requireSignedVersion: true,
      },
    },
    bundle: { createUpdaterArtifacts: true },
  };
}

export async function writeUpdaterConfig(env = process.env) {
  const config = updaterConfig(env);
  const directory = await mkdtemp(
    join(env.RUNNER_TEMP || tmpdir(), 'pocket-gba-updater-'),
  );
  const path = join(directory, 'updater.json');
  await writeFile(path, `${JSON.stringify(config)}\n`, { mode: 0o600 });
  return path;
}

if (isMain(import.meta.url))
  cli(async () => console.log(await writeUpdaterConfig()));
