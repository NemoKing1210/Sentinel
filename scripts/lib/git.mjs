import { spawnSync } from 'node:child_process';

export function git(args, { allowFail = false, input } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8', input });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !allowFail) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

export function currentBranch() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
}

export function isWorktreeClean() {
  return git(['status', '--porcelain']).stdout.length === 0;
}

export function localTagExists(tag) {
  return git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { allowFail: true }).ok;
}

export function remoteTagExists(tag) {
  return git(['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`], { allowFail: true }).ok;
}

export function upstreamDivergence() {
  const upstream = git(['rev-parse', '--abbrev-ref', '@{upstream}'], { allowFail: true });
  if (!upstream.ok) {
    return null;
  }
  const counts = git(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']).stdout.split(/\s+/);
  return {
    upstream: upstream.stdout,
    behind: Number.parseInt(counts[0] ?? '0', 10),
    ahead: Number.parseInt(counts[1] ?? '0', 10),
  };
}
