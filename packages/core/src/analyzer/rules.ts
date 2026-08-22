import { FsEntry, AnalyzerCleanupCandidate } from '../types';

export type CandidateRule = (entries: FsEntry[], scanRoot: string) => AnalyzerCleanupCandidate[];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const HUNDRED_MB_BYTES = 100 * 1024 * 1024;

export const trashRule: CandidateRule = (entries: FsEntry[]): AnalyzerCleanupCandidate[] => {
  const candidates: AnalyzerCleanupCandidate[] = [];
  for (const entry of entries) {
    const norm = entry.path.toLowerCase();
    const isTrashPath =
      norm.includes('/.trash/') ||
      norm.endsWith('/.trash') ||
      norm.includes('/.trashes/') ||
      norm.endsWith('/.trashes');
    if (isTrashPath) {
      candidates.push({
        path: entry.path,
        sizeBytes: entry.sizeBytes,
        reason: 'trash',
        explanation: 'This file is in your Trash and can be permanently deleted.',
        category: 'user_data',
        isSafeToClean: true,
      });
    }
  }
  return candidates;
};

export const staleDownloadsRule: CandidateRule = (
  entries: FsEntry[],
): AnalyzerCleanupCandidate[] => {
  const candidates: AnalyzerCleanupCandidate[] = [];
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.isDirectory) {
      const norm = entry.path.toLowerCase();
      if (norm.includes('/downloads/')) {
        const ageMs = now - new Date(entry.modifiedAt).getTime();
        if (ageMs > THIRTY_DAYS_MS) {
          const daysOld = Math.floor(ageMs / (24 * 60 * 60 * 1000));
          candidates.push({
            path: entry.path,
            sizeBytes: entry.sizeBytes,
            reason: 'stale_downloads',
            explanation: `This file in Downloads has not been touched in ${daysOld} days.`,
            category: 'user_data',
            isSafeToClean: true,
          });
        }
      }
    }
  }
  return candidates;
};

export const largeCacheRule: CandidateRule = (entries: FsEntry[]): AnalyzerCleanupCandidate[] => {
  const candidates: AnalyzerCleanupCandidate[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) {
      const norm = entry.name.toLowerCase();
      if (
        (norm.includes('cache') || norm.includes('deriveddata')) &&
        entry.sizeBytes >= HUNDRED_MB_BYTES
      ) {
        candidates.push({
          path: entry.path,
          sizeBytes: entry.sizeBytes,
          reason: 'large_cache',
          explanation:
            'This cache directory is large and can typically be regenerated automatically.',
          category: 'cache',
          isSafeToClean: true,
        });
      }
    }
  }
  return candidates;
};

export const oldLogsRule: CandidateRule = (entries: FsEntry[]): AnalyzerCleanupCandidate[] => {
  const candidates: AnalyzerCleanupCandidate[] = [];
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.isDirectory) {
      const norm = entry.path.toLowerCase();
      const isLog = entry.extension === '.log' || norm.includes('/logs/') || norm.includes('/log/');
      if (isLog) {
        const ageMs = now - new Date(entry.modifiedAt).getTime();
        if (ageMs > THIRTY_DAYS_MS) {
          candidates.push({
            path: entry.path,
            sizeBytes: entry.sizeBytes,
            reason: 'old_logs',
            explanation: 'This log file is over 30 days old and is safe to remove.',
            category: 'logs',
            isSafeToClean: true,
          });
        }
      }
    }
  }
  return candidates;
};

export const tempFilesRule: CandidateRule = (entries: FsEntry[]): AnalyzerCleanupCandidate[] => {
  const candidates: AnalyzerCleanupCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory) {
      const ext = entry.extension.toLowerCase();
      if (ext === '.tmp' || ext === '.temp') {
        candidates.push({
          path: entry.path,
          sizeBytes: entry.sizeBytes,
          reason: 'temp_files',
          explanation: 'Temporary file left behind by an application — safe to remove.',
          category: 'system',
          isSafeToClean: true,
        });
      }
    }
  }
  return candidates;
};

export const BUILTIN_CANDIDATE_RULES: CandidateRule[] = [
  trashRule,
  staleDownloadsRule,
  largeCacheRule,
  oldLogsRule,
  tempFilesRule,
];
