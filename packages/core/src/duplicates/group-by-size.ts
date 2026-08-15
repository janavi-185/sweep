import { FileEntry } from '@sweep/types';

export function groupBySize(entries: FileEntry[], minSizeBytes: number): Map<number, FileEntry[]> {
  const sizeMap = new Map<number, FileEntry[]>();

  for (const file of entries) {
    if (file.isDirectory) continue;
    if (file.sizeBytes < minSizeBytes) continue;
    if (file.sizeBytes === 0) continue;

    const list = sizeMap.get(file.sizeBytes);
    if (list) {
      list.push(file);
    } else {
      sizeMap.set(file.sizeBytes, [file]);
    }
  }

  // Filter down to groups with 2 or more files sharing the exact size
  const candidateMap = new Map<number, FileEntry[]>();
  for (const [size, files] of sizeMap.entries()) {
    if (files.length >= 2) {
      candidateMap.set(size, files);
    }
  }

  return candidateMap;
}
