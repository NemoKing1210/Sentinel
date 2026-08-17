import { fail, parseArgs } from './lib/cli.mjs';
import {
  extractChangelogSection,
  formatReleaseNotes,
  latestChangelogVersion,
  packageVersion,
} from './lib/versions.mjs';

const args = parseArgs(process.argv.slice(2));
const version = args.positionals[0] ?? latestChangelogVersion() ?? packageVersion();
const section = extractChangelogSection(version);

if (!section) {
  fail(`CHANGELOG.md has no ## [${version}] section`);
}

process.stdout.write(formatReleaseNotes(section, { footer: args.has('github') }));
