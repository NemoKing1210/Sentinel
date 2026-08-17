import { fail, parseArgs } from './lib/cli.mjs';
import {
  currentBranch,
  git,
  isWorktreeClean,
  localTagExists,
  remoteTagExists,
  upstreamDivergence,
} from './lib/git.mjs';
import {
  changelogNotesAreEmpty,
  extractChangelogSection,
  findMismatches,
  formatReleaseNotes,
  latestChangelogVersion,
  packageVersion,
  parseSemver,
} from './lib/versions.mjs';

const DEFAULT_BRANCH = 'main';
const USAGE = `Usage:
  npm run release [-- --dry-run] [--no-push] [--allow-branch] [--allow-empty-notes]

Creates annotated tag v<version> from package.json and pushes it to origin.
Tag and GitHub Release notes come from the latest CHANGELOG.md section.`;

const args = parseArgs(process.argv.slice(2));
if (args.has('help')) {
  console.log(USAGE);
  process.exit(0);
}

const dryRun = args.has('dry-run');
const version = packageVersion();
parseSemver(version);
const tag = `v${version}`;
const latest = latestChangelogVersion();
const notes = extractChangelogSection(latest ?? version);
const mismatches = findMismatches(version);
const branch = currentBranch();
const divergence = upstreamDivergence();
const problems = [];

if (mismatches.length > 0) {
  problems.push(`Version mismatch (expected ${version}):\n${mismatches.map((line) => `  - ${line}`).join('\n')}`);
}
if (latest !== version) {
  problems.push(`Latest CHANGELOG.md section is ${latest ?? 'missing'}, package.json is ${version}`);
}
if (!notes) {
  problems.push(`CHANGELOG.md has no ## [${version}] section`);
} else if (changelogNotesAreEmpty(version) && !args.has('allow-empty-notes')) {
  problems.push(`CHANGELOG.md notes for ${version} are still a stub. Edit them, or pass --allow-empty-notes.`);
}
if (!isWorktreeClean()) {
  problems.push('Working tree is dirty. Commit or stash first.');
}
if (branch !== DEFAULT_BRANCH && !args.has('allow-branch')) {
  problems.push(`Releases must be tagged from ${DEFAULT_BRANCH} (now on ${branch}). Pass --allow-branch to override.`);
}
if (localTagExists(tag)) {
  problems.push(`Local tag ${tag} already exists`);
}
if (divergence?.behind) {
  problems.push(`${divergence.upstream} is ahead by ${divergence.behind}. Pull before releasing.`);
}
if (!args.has('no-push') && remoteTagExists(tag)) {
  problems.push(`origin already has ${tag}`);
}

console.log(`Release Sentinel ${tag}`);
console.log(`Branch: ${branch}`);
if (divergence) {
  console.log(`Upstream: ${divergence.upstream} (ahead ${divergence.ahead})`);
}
if (notes) {
  console.log('');
  console.log(notes.markdown);
}
console.log('');

if (problems.length > 0) {
  fail(problems.join('\n'));
}

if (dryRun) {
  console.log('Dry run: no tag or push.');
  process.exit(0);
}

if (divergence?.ahead) {
  console.log(`Pushing ${divergence.ahead} commit(s) to ${divergence.upstream}...`);
  git(['push']);
}

git(['tag', '-a', tag, '-F', '-'], { input: formatReleaseNotes(notes) });
console.log(`Created ${tag} with notes from CHANGELOG.md`);

if (args.has('no-push')) {
  console.log('Skipped push (--no-push).');
  process.exit(0);
}

git(['push', 'origin', `refs/tags/${tag}`]);
console.log(`Pushed ${tag}`);
console.log('Draft installers: https://github.com/NemoKing1210/Sentinel/actions/workflows/release.yml');
