import { ScanResult, AnalysisResult, AnalyzeOptions, FileEntry, DirectoryEntry } from '../types';
import { computeBreakdown } from './breakdown';
import { identifyCandidates } from './candidates';

let lastScanResult: ScanResult | undefined;

export function setLastScanResult(result: ScanResult): void {
  lastScanResult = result;
}

export function getLastScanResult(): ScanResult | undefined {
  return lastScanResult;
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

  // Cache last scan result in memory
  setLastScanResult(scanResult);

  return analysis;
}

export * from './breakdown';
export * from './candidates';
export * from './rules';
export * from './format';
