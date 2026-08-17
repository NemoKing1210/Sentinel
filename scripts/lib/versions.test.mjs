import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bumpSemver,
  changelogHasVersion,
  changelogNotesAreEmpty,
  extractChangelogSection,
  formatReleaseNotes,
  insertChangelogSection,
  latestChangelogVersion,
  parseSemver,
  resolveNextVersion,
} from './versions.mjs';

describe('parseSemver', () => {
  it('parses a three-part version', () => {
    assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3 });
  });

  it('rejects a non-SemVer string', () => {
    assert.throws(() => parseSemver('v1.2.3'), /Invalid SemVer/);
  });
});

describe('bumpSemver', () => {
  it('bumps patch, minor, and major', () => {
    assert.equal(bumpSemver('0.1.1', 'patch'), '0.1.2');
    assert.equal(bumpSemver('0.1.1', 'minor'), '0.2.0');
    assert.equal(bumpSemver('0.1.1', 'major'), '1.0.0');
  });
});

describe('resolveNextVersion', () => {
  it('accepts a bump kind or an explicit version', () => {
    assert.equal(resolveNextVersion('0.1.1', 'patch'), '0.1.2');
    assert.equal(resolveNextVersion('0.1.1', '2.0.0'), '2.0.0');
  });
});

describe('changelog helpers', () => {
  const sample = `# Changelog

## [0.1.1] - 2026-08-18

### Added

- CI

## [0.1.0] - 2026-08-18

Initial release
`;

  it('extracts a version section', () => {
    const section = extractChangelogSection('0.1.1', sample);
    assert.ok(section);
    assert.match(section.markdown, /## Sentinel 0.1.1/);
    assert.match(section.body, /CI/);
  });

  it('inserts a stub above the latest section', () => {
    const next = insertChangelogSection(sample, '0.1.2', '2026-08-18');
    assert.equal(changelogHasVersion('0.1.2', next), true);
    assert.match(next, /## \[0.1.2\][\s\S]*## \[0.1.1\]/);
    assert.equal(changelogNotesAreEmpty('0.1.2', next), true);
    assert.equal(changelogNotesAreEmpty('0.1.1', next), false);
  });

  it('does not duplicate an existing section', () => {
    const next = insertChangelogSection(sample, '0.1.1', '2026-08-18');
    assert.equal(next, sample);
  });

  it('reads the latest changelog version', () => {
    assert.equal(latestChangelogVersion(sample), '0.1.1');
  });

  it('formats GitHub release notes from a section', () => {
    const section = extractChangelogSection('0.1.1', sample);
    assert.ok(section);
    const notes = formatReleaseNotes(section, { footer: true });
    assert.match(notes, /## Sentinel 0.1.1/);
    assert.match(notes, /Download the installer/);
  });
});
