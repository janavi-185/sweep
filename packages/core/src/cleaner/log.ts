import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CleanupSessionResult } from '@sweep/types';
import { formatBytes } from '../scanner/metadata';

export function getLogsDir(): string {
  return path.join(os.homedir(), '.sweep', 'logs');
}

export function writeCleanupLog(session: CleanupSessionResult): string | undefined {
  try {
    const logsDir = getLogsDir();
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

    const logPath = path.join(logsDir, `cleanup_${timestamp}.txt`);

    const lines: string[] = [];
    lines.push('Sweep Cleanup Log');
    lines.push(`Started:   ${session.startedAt.toISOString()}`);
    lines.push(`Completed: ${session.completedAt.toISOString()}`);
    lines.push(`Dry Run:   ${session.isDryRun}`);
    lines.push('');

    for (const res of session.itemResults) {
      const statusPad = res.actionTaken.toUpperCase().padEnd(10);
      const sizePad = formatBytes(res.freedBytes).padStart(10);
      const err = res.error ? ` (${res.error})` : '';
      lines.push(
        `${statusPad} ${sizePad}   ${res.candidate.path} [${res.candidate.rule.id}]${err}`,
      );
    }

    lines.push('');
    lines.push('---');
    lines.push(`Total candidates: ${session.totalCandidatesCount}`);
    lines.push(`Cleaned:          ${session.cleanedCount}`);
    lines.push(`Skipped:          ${session.skippedCount}`);
    lines.push(`Failed:           ${session.failedCount}`);
    lines.push(`Total freed:      ${formatBytes(session.totalFreedBytes)}`);

    fs.writeFileSync(logPath, lines.join('\n'), 'utf-8');
    return logPath;
  } catch {
    return undefined;
  }
}
