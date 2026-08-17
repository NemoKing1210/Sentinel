import { findMismatches, changelogHasVersion, latestChangelogVersion, packageVersion } from './lib/versions.mjs';

const expected = packageVersion();
const mismatches = findMismatches(expected);
const latest = latestChangelogVersion();

if (!changelogHasVersion(expected)) {
  mismatches.push(`CHANGELOG.md: missing ## [${expected}] section`);
} else if (latest !== expected) {
  mismatches.push(`CHANGELOG.md latest section is ${latest}, expected ${expected}`);
}

if (mismatches.length > 0) {
  console.error(`Version mismatch (expected ${expected}):`);
  for (const line of mismatches) {
    console.error(`  - ${line}`);
  }
  process.exit(1);
}

console.log(`Versions match ${expected}`);
