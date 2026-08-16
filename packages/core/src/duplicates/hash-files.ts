import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { FileEntry } from '@sweep/types';

export function computeSha256(rawPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const resolvedPath = rawPath.replace(/^~(?=$|\/)/, os.homedir());
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(resolvedPath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

// TODO(phase-9): parallelise file hashing using worker_threads or bounded concurrency
export async function hashFiles(
  sizeGroups: Map<number, FileEntry[]>,
  onProgress?: (hashed: number, total: number, currentPath: string) => void,
): Promise<Map<string, FileEntry[]>> {
  const allCandidates: FileEntry[] = [];
  for (const files of sizeGroups.values()) {
    allCandidates.push(...files);
  }

  const total = allCandidates.length;
  const hashGroupMap = new Map<string, FileEntry[]>();
  let hashedCount = 0;

  for (const file of allCandidates) {
    try {
      const digest = await computeSha256(file.path);
      hashedCount += 1;
      if (onProgress) {
        onProgress(hashedCount, total, file.path);
      }

      const group = hashGroupMap.get(digest);
      if (group) {
        group.push(file);
      } else {
        hashGroupMap.set(digest, [file]);
      }
    } catch {
      // Handles ENOENT (file removed mid-scan) or EACCES (permission denied) gracefully
      hashedCount += 1;
      if (onProgress) {
        onProgress(hashedCount, total, file.path);
      }
    }
  }

  // Filter to groups with at least 2 matching hashes
  const result = new Map<string, FileEntry[]>();
  for (const [digest, files] of hashGroupMap.entries()) {
    if (files.length >= 2) {
      result.set(digest, files);
    }
  }

  return result;
}
