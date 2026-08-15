import os from 'node:os';
import {
  CleanupCandidate,
  SafetyRule,
  AnalyzerCleanupCandidate,
  DevToolResult,
} from '@sweep/types';
import { ALL_SAFETY_RULES } from '@sweep/rules';

export function matchesPattern(rawPath: string, pattern: string): boolean {
  const home = os.homedir();
  const normPath = rawPath.replace(/^~(?=$|\/)/, home).toLowerCase();
  const normPattern = pattern.replace(/^~(?=$|\/)/, home).toLowerCase();

  const basePattern = normPattern.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
  if (normPath === basePattern || normPath.startsWith(basePattern + '/')) {
    return true;
  }

  const filename = normPath.split('/').pop() || '';
  if (normPattern.startsWith('**/*.')) {
    const ext = '.' + normPattern.split('.').pop();
    return filename.endsWith(ext);
  }

  return false;
}

export function matchRule(
  targetPath: string,
  rules: SafetyRule[] = ALL_SAFETY_RULES,
): SafetyRule | undefined {
  for (const rule of rules) {
    for (const pattern of rule.paths) {
      if (matchesPattern(targetPath, pattern)) {
        return rule;
      }
    }
  }
  return undefined;
}

export function collectAnalyzerCandidates(
  candidates: AnalyzerCleanupCandidate[],
  rules: SafetyRule[] = ALL_SAFETY_RULES,
): CleanupCandidate[] {
  const results: CleanupCandidate[] = [];

  for (const item of candidates) {
    const matchedRule = matchRule(item.path, rules);
    if (matchedRule) {
      const name = item.path.split('/').pop() || item.path;
      results.push({
        id: `${matchedRule.id}:${item.path}`,
        path: item.path,
        name,
        sizeBytes: item.sizeBytes,
        rule: matchedRule,
        reason: item.reason,
        explanation: item.explanation,
      });
    }
  }

  return results;
}

export function collectDevStorageCandidates(
  devTools: DevToolResult[],
  rules: SafetyRule[] = ALL_SAFETY_RULES,
): CleanupCandidate[] {
  const results: CleanupCandidate[] = [];

  for (const toolRes of devTools) {
    if (toolRes.isInstalled && toolRes.tool.isSafeToClean) {
      for (const mPath of toolRes.measuredPaths) {
        if (mPath.exists && mPath.sizeBytes > 0) {
          const matchedRule = matchRule(mPath.path, rules);
          if (matchedRule) {
            results.push({
              id: `${matchedRule.id}:${mPath.path}`,
              path: mPath.path,
              name: mPath.label,
              sizeBytes: mPath.sizeBytes,
              rule: matchedRule,
              reason: 'developer_storage',
              explanation: mPath.label,
            });
          }
        }
      }
    }
  }

  return results;
}
