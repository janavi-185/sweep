import { FileCategory } from '../types';

const EXTENSION_MAP: Record<string, FileCategory> = {
  // Video
  mp4: FileCategory.Video,
  mov: FileCategory.Video,
  mkv: FileCategory.Video,
  avi: FileCategory.Video,
  m4v: FileCategory.Video,
  webm: FileCategory.Video,
  flv: FileCategory.Video,
  wmv: FileCategory.Video,

  // Audio
  mp3: FileCategory.Audio,
  m4a: FileCategory.Audio,
  flac: FileCategory.Audio,
  wav: FileCategory.Audio,
  aac: FileCategory.Audio,
  ogg: FileCategory.Audio,
  wma: FileCategory.Audio,

  // Image
  jpg: FileCategory.Image,
  jpeg: FileCategory.Image,
  png: FileCategory.Image,
  gif: FileCategory.Image,
  heic: FileCategory.Image,
  webp: FileCategory.Image,
  svg: FileCategory.Image,
  bmp: FileCategory.Image,
  tiff: FileCategory.Image,
  raw: FileCategory.Image,
  psd: FileCategory.Image,

  // Document
  pdf: FileCategory.Document,
  docx: FileCategory.Document,
  doc: FileCategory.Document,
  xlsx: FileCategory.Document,
  xls: FileCategory.Document,
  pptx: FileCategory.Document,
  ppt: FileCategory.Document,
  pages: FileCategory.Document,
  numbers: FileCategory.Document,
  key: FileCategory.Document,
  md: FileCategory.Document,
  txt: FileCategory.Document,
  rtf: FileCategory.Document,

  // Archive
  zip: FileCategory.Archive,
  tar: FileCategory.Archive,
  gz: FileCategory.Archive,
  rar: FileCategory.Archive,
  '7z': FileCategory.Archive,
  dmg: FileCategory.Archive,
  pkg: FileCategory.Archive,
  bz2: FileCategory.Archive,
  xz: FileCategory.Archive,
  tgz: FileCategory.Archive,
  iso: FileCategory.Archive,

  // Code
  ts: FileCategory.Code,
  tsx: FileCategory.Code,
  js: FileCategory.Code,
  jsx: FileCategory.Code,
  py: FileCategory.Code,
  swift: FileCategory.Code,
  java: FileCategory.Code,
  go: FileCategory.Code,
  rs: FileCategory.Code,
  c: FileCategory.Code,
  cpp: FileCategory.Code,
  h: FileCategory.Code,
  hpp: FileCategory.Code,
  rb: FileCategory.Code,
  php: FileCategory.Code,
  html: FileCategory.Code,
  css: FileCategory.Code,
  scss: FileCategory.Code,

  // Data
  json: FileCategory.Data,
  csv: FileCategory.Data,
  xml: FileCategory.Data,
  db: FileCategory.Data,
  sqlite: FileCategory.Data,
  sqlite3: FileCategory.Data,
  yaml: FileCategory.Data,
  yml: FileCategory.Data,
  sql: FileCategory.Data,

  // Log
  log: FileCategory.Log,

  // Temporary
  tmp: FileCategory.Temporary,
  temp: FileCategory.Temporary,
  swp: FileCategory.Temporary,
  swo: FileCategory.Temporary,
};

export function categoriseFile(filePath: string, extension: string): FileCategory {
  const normalizedPath = filePath.toLowerCase();
  const cleanExt = extension.toLowerCase().replace(/^\./, '');

  // Check path indicators first (Cache, Log, Temporary)
  if (
    normalizedPath.includes('/cache/') ||
    normalizedPath.includes('/caches/') ||
    normalizedPath.includes('/.cache/') ||
    normalizedPath.includes('/deriveddata/')
  ) {
    return FileCategory.Cache;
  }

  if (normalizedPath.includes('/logs/') || normalizedPath.includes('/log/')) {
    return FileCategory.Log;
  }

  if (normalizedPath.includes('/tmp/') || normalizedPath.includes('/temp/')) {
    return FileCategory.Temporary;
  }

  if (cleanExt in EXTENSION_MAP) {
    return EXTENSION_MAP[cleanExt]!;
  }

  return FileCategory.Other;
}
