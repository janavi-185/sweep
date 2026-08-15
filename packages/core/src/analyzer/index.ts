import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ScanResult, AnalysisResult, AnalyzeOptions, FileEntry, DirectoryEntry } from '../types';
import { computeBreakdown } from './breakdown';
import { identifyCandidates } from './candidates';

let memoryScanResult: ScanResult | undefined;

function getCacheFilePath(): string {
  return path.join(os.homedir(), '.sweep', 'last-scan.json');
}

export function setLastScanResult(result: ScanResult): void {
  memoryScanResult = result;
  try {
    const cacheFile = getCacheFilePath();
    const cacheDir = path.dirname(cacheFile);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf-8');
  } catch {
    // Ignore file write errors (e.g. read-only system)
  }
}

export function getLastScanResult(): ScanResult | undefined {
  if (memoryScanResult) {
    return memoryScanResult;
  }

  try {
    const cacheFile = getCacheFilePath();
    if (fs.existsSync(cacheFile)) {
      const data = fs.readFileSync(cacheFile, 'utf-8');
      const parsed = JSON.parse(data) as ScanResult;
      // Re-hydrate Date objects
      parsed.scannedAt = new Date(parsed.scannedAt);
      for (const entry of parsed.entries) {
        if (!entry.isDirectory) {
          entry.modifiedAt = new Date(entry.modifiedAt);
        }
      }
      memoryScanResult = parsed;
      return parsed;
    }
  } catch {
    // Return undefined on read/parse error
  }

  return undefined;
}

export function analyzeResult(
  scanResult: ScanResult,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const topN = options.topN ?? 10;
  const breakdown = computeBreakdown(scanResult);

  // Sort files descending by size
  const topFiles: FileEntry[] = [...scanResult.entries]
    .filter((e): e is FileEntry => !e.isDirectory)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, topN);

  // Sort directories descending by size
  const topDirectories: DirectoryEntry[] = [...scanResult.entries]
    .filter((e): e is DirectoryEntry => e.isDirectory)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, topN);

  const candidates = identifyCandidates(scanResult.entries, scanResult.rootPath);

  const analysis: AnalysisResult = {
    scanResult,
    analyzedAt: new Date(),
    breakdown,
    topFiles,
    topDirectories,
    candidates,
  };

  // Persist last scan result to disk
  setLastScanResult(scanResult);

  return analysis;
}

export * from './breakdown';
export * from './candidates';
export * from './rules';
export * from './format';
