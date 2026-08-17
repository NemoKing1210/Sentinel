import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
export const BUMP_KINDS = new Set(['patch', 'minor', 'major']);

const CARGO_PACKAGE_VERSION = /^(\[package\][\s\S]*?^version = ")([^"]+)(")/m;
const CARGO_LOCK_VERSION = /^(name = "sentinel"\r?\nversion = ")([^"]+)(")/m;
const AGENTS_VERSION = /(Version: `)(\d+\.\d+\.\d+)(`)/;
const CHANGELOG_HEADING = (version) => new RegExp(`^## \\[${escapeDots(version)}\\]`, 'm');

export function todayIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseSemver(version) {
  const match = version.match(SEMVER);
  if (!match) {
    throw new Error(`Invalid SemVer: ${version}`);
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

export function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

export function bumpSemver(version, kind) {
  if (!BUMP_KINDS.has(kind)) {
    throw new Error(`Unknown bump: ${kind}`);
  }
  const parsed = parseSemver(version);
  if (kind === 'major') {
    return formatSemver({ major: parsed.major + 1, minor: 0, patch: 0 });
  }
  if (kind === 'minor') {
    return formatSemver({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
  }
  return formatSemver({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 });
}

export function resolveNextVersion(current, target) {
  if (BUMP_KINDS.has(target)) {
    return bumpSemver(current, target);
  }
  parseSemver(target);
  return target;
}

export function readText(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

export function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

export function packageVersion() {
  return readJson('package.json').version;
}

export function collectVersions() {
  const lockfile = readJson('package-lock.json');
  return [
    ['package.json', packageVersion()],
    ['package-lock.json', lockfile.version],
    ['package-lock.json packages[""]', lockfile.packages?.['']?.version],
    [
      'src-tauri/Cargo.toml',
      firstMatch(readText('src-tauri/Cargo.toml'), CARGO_PACKAGE_VERSION, 'src-tauri/Cargo.toml'),
    ],
    ['src-tauri/Cargo.lock', firstMatch(readText('src-tauri/Cargo.lock'), CARGO_LOCK_VERSION, 'src-tauri/Cargo.lock')],
    ['src-tauri/tauri.conf.json', readJson('src-tauri/tauri.conf.json').version],
    ['AGENTS.md', firstMatch(readText('AGENTS.md'), AGENTS_VERSION, 'AGENTS.md')],
  ];
}

export function findMismatches(expected = packageVersion()) {
  return collectVersions()
    .filter(([, version]) => version !== expected)
    .map(([label, version]) => `${label}: ${version}`);
}

export function changelogHasVersion(version, changelog = readText('CHANGELOG.md')) {
  return CHANGELOG_HEADING(version).test(changelog);
}

export function latestChangelogVersion(changelog = readText('CHANGELOG.md')) {
  return changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1] ?? null;
}

export function formatReleaseNotes(section, { footer = false } = {}) {
  const parts = [section.markdown.trim()];
  if (footer) {
    parts.push('---\n\nDownload the installer for your platform from the assets below.');
  }
  return `${parts.join('\n\n')}\n`;
}

export function extractChangelogSection(version, changelog = readText('CHANGELOG.md')) {
  const heading = new RegExp(`^## \\[${escapeDots(version)}\\][^\\n]*\\n`, 'm');
  const start = changelog.search(heading);
  if (start === -1) {
    return null;
  }

  const afterHeading = start + changelog.slice(start).indexOf('\n') + 1;
  const nextHeading = changelog.slice(afterHeading).search(/^## \[/m);
  const body = (
    nextHeading === -1 ? changelog.slice(afterHeading) : changelog.slice(afterHeading, afterHeading + nextHeading)
  ).trim();

  return { heading: changelog.slice(start, afterHeading).trim(), body, markdown: `## Sentinel ${version}\n\n${body}` };
}

export function changelogNotesAreEmpty(version, changelog = readText('CHANGELOG.md')) {
  const section = extractChangelogSection(version, changelog);
  if (!section) {
    return true;
  }
  const text = section.body
    .replace(/^### \w+\s*/gm, '')
    .replace(/^-\s*Describe the user-facing change\s*$/gm, '')
    .replace(/^-\s*$/gm, '')
    .trim();
  return text.length === 0;
}

export function insertChangelogSection(changelog, version, date) {
  if (changelogHasVersion(version, changelog)) {
    return changelog;
  }

  const section = `## [${version}] - ${date}\n\n### Changed\n\n- Describe the user-facing change\n`;
  const firstHeading = changelog.search(/^## \[/m);
  if (firstHeading === -1) {
    return `${changelog.trimEnd()}\n\n${section}`;
  }
  return `${changelog.slice(0, firstHeading)}${section}\n${changelog.slice(firstHeading)}`;
}

export function applyVersion(nextVersion, { date = todayIsoDate() } = {}) {
  parseSemver(nextVersion);
  const previous = packageVersion();
  const changelogBefore = readText('CHANGELOG.md');

  replaceFile('package.json', (source) => replaceFirstJsonVersion(source, nextVersion));
  replaceFile('package-lock.json', (source) =>
    source.replace(/("name": "sentinel",\r?\n\s*"version": ")([^"]+)(")/g, `$1${nextVersion}$3`),
  );
  replaceFile('src-tauri/tauri.conf.json', (source) => replaceFirstJsonVersion(source, nextVersion));
  replaceFile('src-tauri/Cargo.toml', (source) =>
    replaceOne(source, CARGO_PACKAGE_VERSION, nextVersion, 'src-tauri/Cargo.toml'),
  );
  replaceFile('src-tauri/Cargo.lock', (source) =>
    replaceOne(source, CARGO_LOCK_VERSION, nextVersion, 'src-tauri/Cargo.lock'),
  );
  replaceFile('AGENTS.md', (source) => replaceOne(source, AGENTS_VERSION, nextVersion, 'AGENTS.md'));

  const changelogAdded = !changelogHasVersion(nextVersion, changelogBefore);
  replaceFile('CHANGELOG.md', (source) => insertChangelogSection(source, nextVersion, date));

  return { previous, next: nextVersion, changelogAdded };
}

function firstMatch(source, pattern, label) {
  const match = source.match(pattern);
  if (!match?.[2]) {
    throw new Error(`Could not read ${label}`);
  }
  return match[2];
}

function replaceFirstJsonVersion(source, nextVersion) {
  const updated = source.replace(/("version"\s*:\s*")([^"]+)(")/, `$1${nextVersion}$3`);
  if (updated === source) {
    throw new Error('Could not replace JSON version');
  }
  return updated;
}

function replaceOne(source, pattern, nextVersion, label) {
  if (!pattern.test(source)) {
    throw new Error(`Could not replace version in ${label}`);
  }
  return source.replace(pattern, `$1${nextVersion}$3`);
}

function replaceFile(relativePath, transform) {
  const source = readText(relativePath);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let next = transform(source);
  next = next.replace(/\r?\n/g, newline);
  if (!next.endsWith(newline)) {
    next += newline;
  }
  writeFileSync(join(ROOT, relativePath), next);
}

function escapeDots(version) {
  return version.replaceAll('.', '\\.');
}
