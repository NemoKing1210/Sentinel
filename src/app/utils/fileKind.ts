export type FileKind =
  | 'folder'
  | 'archive'
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'executable'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'font'
  | 'disk'
  | 'database'
  | 'text'
  | 'unknown';

const EXT_TO_KIND: Record<string, FileKind> = {
  // archives
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  bz2: 'archive',
  xz: 'archive',
  // images
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  ico: 'image',
  tiff: 'image',
  tif: 'image',
  heic: 'image',
  // videos
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  webm: 'video',
  flv: 'video',
  wmv: 'video',
  m4v: 'video',
  // audio
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  aac: 'audio',
  wma: 'audio',
  opus: 'audio',
  // code
  js: 'code',
  mjs: 'code',
  cjs: 'code',
  ts: 'code',
  jsx: 'code',
  tsx: 'code',
  py: 'code',
  rs: 'code',
  go: 'code',
  java: 'code',
  c: 'code',
  h: 'code',
  cpp: 'code',
  cc: 'code',
  cxx: 'code',
  hpp: 'code',
  cs: 'code',
  rb: 'code',
  php: 'code',
  swift: 'code',
  kt: 'code',
  scala: 'code',
  html: 'code',
  htm: 'code',
  css: 'code',
  scss: 'code',
  sass: 'code',
  less: 'code',
  json: 'code',
  xml: 'code',
  yml: 'code',
  yaml: 'code',
  toml: 'code',
  sh: 'code',
  bash: 'code',
  zsh: 'code',
  ps1: 'code',
  sql: 'code',
  // executables
  exe: 'executable',
  msi: 'executable',
  dll: 'executable',
  bat: 'executable',
  cmd: 'executable',
  app: 'executable',
  deb: 'executable',
  rpm: 'executable',
  pkg: 'executable',
  run: 'executable',
  // documents
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  // text
  txt: 'text',
  md: 'text',
  log: 'text',
  // spreadsheets
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  csv: 'spreadsheet',
  ods: 'spreadsheet',
  numbers: 'spreadsheet',
  // presentations
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
  key: 'presentation',
  // fonts
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  eot: 'font',
  // disk images
  iso: 'disk',
  img: 'disk',
  dmg: 'disk',
  // databases
  db: 'database',
  sqlite: 'database',
  sqlite3: 'database',
  mdb: 'database',
  accdb: 'database',
};

const EXT_TO_MIME: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  log: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  csv: 'text/csv',
  js: 'application/javascript',
  mjs: 'application/javascript',
  cjs: 'application/javascript',
  ts: 'application/typescript',
  tsx: 'application/typescript',
  jsx: 'application/javascript',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  py: 'text/x-python',
  rs: 'text/x-rust',
  go: 'text/x-go',
  java: 'text/x-java',
  c: 'text/x-c',
  h: 'text/x-c',
  cpp: 'text/x-c++',
  cc: 'text/x-c++',
  cxx: 'text/x-c++',
  hpp: 'text/x-c++',
  cs: 'text/x-csharp',
  rb: 'text/x-ruby',
  php: 'application/x-php',
  sh: 'application/x-shellscript',
  bash: 'application/x-shellscript',
  zsh: 'application/x-shellscript',
  ps1: 'application/x-powershell',
  sql: 'application/sql',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heic: 'image/heic',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv',
  m4v: 'video/x-m4v',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  numbers: 'application/vnd.apple.numbers',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  key: 'application/vnd.apple.keynote',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
  exe: 'application/x-msdownload',
  msi: 'application/x-msi',
  dll: 'application/x-msdownload',
  bat: 'application/bat',
  cmd: 'application/cmd',
  app: 'application/x-mach-binary',
  deb: 'application/x-deb',
  rpm: 'application/x-rpm',
  pkg: 'application/x-apple-pkg',
  iso: 'application/x-iso9660-image',
  img: 'application/x-img',
  dmg: 'application/x-apple-diskimage',
  db: 'application/x-database',
  sqlite: 'application/x-sqlite3',
  sqlite3: 'application/x-sqlite3',
  mdb: 'application/x-msaccess',
  accdb: 'application/x-msaccess',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  eot: 'application/vnd.ms-fontobject',
};

export function extensionOf(filename: string): string {
  const slashIndex = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  const base = slashIndex >= 0 ? filename.slice(slashIndex + 1) : filename;
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === base.length - 1) return '';
  return base.slice(dotIndex + 1).toLowerCase();
}

export function detectFileKind(filename: string): FileKind {
  const ext = extensionOf(filename);
  if (!ext) return 'unknown';
  return EXT_TO_KIND[ext] ?? 'unknown';
}

export function detectMimeType(filename: string, folder = false): string {
  if (folder) return 'application/zip';
  const ext = extensionOf(filename);
  if (!ext) return 'application/octet-stream';
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}