import { FileEntry, DuplicateGroup, DuplicateReport } from '@sweep/types';

export function buildReport(
  scannedPath: string,
  hashGroups: Map<string, FileEntry[]>,
  metadata: { filesScanned: number; filesHashed: number; durationMs: number },
): DuplicateReport {
  const groups: DuplicateGroup[] = [];
  let totalWastedBytes = 0;

  for (const [hash, files] of hashGroups.entries()) {
    if (files.length < 2) continue;

    // Sort files by modifiedAt ascending (oldest first = presumed original)
    files.sort((a, b) => new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime());

    const sizeBytes = files[0]!.sizeBytes;
    const wastedBytes = sizeBytes * (files.length - 1);
    totalWastedBytes += wastedBytes;

    groups.push({
      hash,
      sizeBytes,
      wastedBytes,
      files,
    });
  }

  // Sort groups by wastedBytes descending (most wasteful first)
  groups.sort((a, b) => b.wastedBytes - a.wastedBytes);

  return {
    scannedPath,
    generatedAt: new Date(),
    durationMs: metadata.durationMs,
    filesScanned: metadata.filesScanned,
    filesHashed: metadata.filesHashed,
    duplicateGroupCount: groups.length,
    totalWastedBytes,
    groups,
  };
}
