import { cli, isMain } from './release-utils.mjs';

function boolean(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

/** Updater signatures are mandatory for drafts; paid OS signing is independent. */
export function releaseOptions(env = process.env) {
  if (env.RELEASE_EVENT === 'push') {
    return {
      sign: boolean(
        env.DESKTOP_PLATFORM_SIGNING,
        false,
        'DESKTOP_PLATFORM_SIGNING',
      ),
      updater: true,
    };
  }
  if (env.RELEASE_EVENT === 'workflow_dispatch') {
    return {
      sign: boolean(
        env.PLATFORM_SIGN_REQUESTED,
        false,
        'PLATFORM_SIGN_REQUESTED',
      ),
      updater: boolean(env.UPDATER_REQUESTED, true, 'UPDATER_REQUESTED'),
    };
  }
  throw new Error('Release options require a tag push or manual dispatch');
}

if (isMain(import.meta.url))
  cli(() => {
    const { sign, updater } = releaseOptions();
    console.log(`sign=${sign}\nupdater=${updater}`);
  });
