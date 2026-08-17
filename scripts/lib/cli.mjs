export function parseArgs(argv) {
  const flags = new Set();
  const positionals = [];

  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      flags.add(arg.slice(2));
      continue;
    }
    positionals.push(arg);
  }

  return {
    flags,
    positionals,
    has(name) {
      return flags.has(name);
    },
  };
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}
