import { FsEntry, AnalyzerCleanupCandidate } from '../types';
import { BUILTIN_CANDIDATE_RULES } from './rules';

export function identifyCandidates(
  entries: FsEntry[],
  scanRoot: string,
): AnalyzerCleanupCandidate[] {
  const seenPaths = new Set<string>();
  const candidates: AnalyzerCleanupCandidate[] = [];

  for (const rule of BUILTIN_CANDIDATE_RULES) {
    const matches = rule(entries, scanRoot);
    for (const candidate of matches) {
      if (!seenPaths.has(candidate.path)) {
        seenPaths.add(candidate.path);
        candidates.push(candidate);
      }
    }
  }

  // Sort candidates by sizeBytes descending
  candidates.sort((a, b) => b.sizeBytes - a.sizeBytes);

  return candidates;
}
