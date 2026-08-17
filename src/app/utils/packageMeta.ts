import pkg from '../../../package.json';

export interface ProjectMeta {
  name: string;
  version: string;
  license: string;
  authorName: string;
  authorUrl: string;
  homepage: string;
  repositoryUrl: string;
  issuesUrl: string;
}

function parseAuthor(value: string): { name: string; url: string } {
  const match = value.match(/^([^(<]+?)\s*(?:\(([^)]+)\))?\s*(?:<([^>]+)>)?\s*$/);
  return {
    name: (match?.[1] ?? value).trim(),
    url: (match?.[2] ?? match?.[3] ?? '').trim(),
  };
}

const author = parseAuthor(pkg.author ?? '');

export const PROJECT_META: ProjectMeta = {
  name: pkg.name,
  version: pkg.version,
  license: pkg.license ?? '',
  authorName: author.name,
  authorUrl: author.url,
  homepage: pkg.homepage ?? '',
  repositoryUrl: (pkg.repository?.url ?? pkg.homepage ?? '').replace(/\.git$/, ''),
  issuesUrl: pkg.bugs?.url ?? '',
};
