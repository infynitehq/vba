import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const targets = {
  'darwin-aarch64': { update: '.app.tar.gz', installers: ['.dmg'] },
  'darwin-x86_64': { update: '.app.tar.gz', installers: ['.dmg'] },
  'windows-x86_64': { update: '.exe', installers: [] },
  'linux-x86_64': { update: '.AppImage', installers: ['.deb'] },
};

export function versionFromTag(tag) {
  if (
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:[0-9A-Za-z-]+\.)*[0-9A-Za-z-]+)?$/.test(
      tag ?? '',
    )
  )
    throw new Error('Expected a version tag such as v1.2.3 or v1.2.3-beta.1');
  const version = tag.slice(1);
  if (
    version
      .split('-')
      .slice(1)
      .join('-')
      .split('.')
      .some(
        (part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'),
      )
  )
    throw new Error(
      'Numeric prerelease identifiers must not have leading zeros',
    );
  return version;
}

export function publicHttps(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    !host.includes('.') ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host === 'localhost' ||
    host.includes(':') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host)
  )
    throw new Error(
      'Expected a public HTTPS URL without credentials, query, fragment, or custom port',
    );
  return url.href;
}

export function distributionRepo(value) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value ?? '') ||
    value.split('/')[1] === '.' ||
    value.split('/')[1] === '..'
  )
    throw new Error(
      'DESKTOP_UPDATE_REPOSITORY must be an explicit owner/repository',
    );
  return value;
}

export function assetUrl(repo, tag, file) {
  distributionRepo(repo);
  versionFromTag(tag);
  return publicHttps(
    `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`,
  );
}

export function releaseEndpoint(repo, endpoint) {
  distributionRepo(repo);
  const actual = publicHttps(endpoint);
  const expected = `https://github.com/${repo}/releases/latest/download/latest.json`;
  if (actual !== expected)
    throw new Error(
      'DESKTOP_UPDATE_ENDPOINT must be the stable latest.json feed in DESKTOP_UPDATE_REPOSITORY',
    );
  return actual;
}

export function isMain(meta) {
  return (
    Boolean(process.argv[1]) && fileURLToPath(meta) === resolve(process.argv[1])
  );
}

export function cli(main) {
  Promise.resolve()
    .then(main)
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
