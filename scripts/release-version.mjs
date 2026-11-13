import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function validVersion(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(
      version,
    );
  if (!match || match[0] !== version) return false;
  const identifiers = (value) => !value || value.split('.').every(Boolean);
  return (
    identifiers(match[4]) &&
    identifiers(match[5]) &&
    (!match[4] ||
      match[4]
        .split('.')
        .every((part) => !/^\d+$/.test(part) || !/^0\d/.test(part)))
  );
}

function versionFiles(directory) {
  const definitions = [
    ['package.json', 'json'],
    ['desktop/tauri.conf.json', 'json'],
    ['desktop/Cargo.toml', 'toml'],
  ];
  return definitions.map(([name, kind]) => {
    const path = resolve(directory, name);
    const content = readFileSync(path, 'utf8');
    let version;
    let update;
    if (kind === 'json') {
      version = JSON.parse(content).version;
      update = (next) =>
        content.replace(
          /^(\s*"version"\s*:\s*")[^"]+(")/m,
          (_, before, after) => `${before}${next}${after}`,
        );
    } else {
      const start = content.indexOf('[package]');
      if (start < 0) throw new Error(`${name} has no [package] section.`);
      const rest = content.slice(start + '[package]'.length);
      const nextSection = rest.search(/^\[/m);
      const end =
        nextSection < 0
          ? content.length
          : start + '[package]'.length + nextSection;
      const block = content.slice(start, end);
      const expression = /^(version\s*=\s*")[^"]+(")/m;
      version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
      update = (next) =>
        content.slice(0, start) +
        block.replace(
          expression,
          (_, before, after) => `${before}${next}${after}`,
        ) +
        content.slice(end);
    }
    if (typeof version !== 'string' || !validVersion(version))
      throw new Error(`${name} has no valid literal application version.`);
    return { name, path, version, content, update };
  });
}

export function checkVersions(directory = root, tag) {
  const files = versionFiles(directory);
  const version = files[0].version;
  const mismatch = files.filter((file) => file.version !== version);
  if (mismatch.length)
    throw new Error(
      `Version mismatch: ${files.map((file) => `${file.name}=${file.version}`).join(', ')}`,
    );
  if (tag !== undefined && tag !== `v${version}`)
    throw new Error(`Release tag ${tag} must exactly match v${version}.`);
  return version;
}

export function setVersion(version, directory = root) {
  if (!validVersion(version)) throw new Error(`Invalid SemVer: ${version}`);
  // Validate and prepare every replacement before modifying any file.
  const changes = versionFiles(directory).map((file) => {
    const next = file.update(version);
    if (file.version !== version && next === file.content)
      throw new Error(`Could not update the version in ${file.name}.`);
    return { ...file, next };
  });
  for (const file of changes)
    if (file.next !== file.content) writeFileSync(file.path, file.next);
  return checkVersions(directory);
}

function main(args) {
  let check = false;
  let tag;
  let version;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') check = true;
    else if (args[i] === '--tag') {
      tag = args[++i];
      if (!tag) throw new Error('--tag requires a version tag.');
    } else if (!args[i].startsWith('-') && version === undefined)
      version = args[i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if ((check && version) || (!check && (!version || tag)))
    throw new Error(
      'Usage: pnpm release:version <version> | --check [--tag v<version>]',
    );
  const result = check ? checkVersions(root, tag) : setVersion(version);
  console.log(`${check ? 'Verified' : 'Set'} application version ${result}.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
