import { fail, parseArgs } from './lib/cli.mjs';
import { applyVersion, BUMP_KINDS, packageVersion, resolveNextVersion } from './lib/versions.mjs';

const USAGE = `Usage:
  npm run version:patch
  npm run version:minor
  npm run version:major
  node scripts/bump-version.mjs <patch|minor|major|x.y.z> [--dry-run]

Updates package.json, lockfiles, Cargo.toml, tauri.conf.json, AGENTS.md,
and inserts a CHANGELOG.md stub when that version is missing.`;

const args = parseArgs(process.argv.slice(2));
if (args.has('help') || args.positionals.length !== 1) {
  console.log(USAGE);
  process.exit(args.has('help') ? 0 : 1);
}

const current = packageVersion();
let next;
try {
  next = resolveNextVersion(current, args.positionals[0]);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (next === current) {
  fail(`Already at ${current}`);
}

if (args.has('dry-run')) {
  console.log(`${current} → ${next} (dry run)`);
  process.exit(0);
}

const result = applyVersion(next);
console.log(`${result.previous} → ${result.next}`);
if (result.changelogAdded) {
  console.log('Inserted a CHANGELOG.md stub. Edit the notes before you commit.');
} else {
  console.log(`CHANGELOG.md already has ## [${result.next}].`);
}
