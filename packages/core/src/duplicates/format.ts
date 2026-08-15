import { DuplicateReport } from '@sweep/types';
import { formatBytes } from '../scanner/metadata';

export function formatDuplicateReport(report: DuplicateReport): string {
  const lines: string[] = [];

  lines.push('  Sweep — Duplicate Files');
  lines.push('──────────────────────────────────────────────────');
  lines.push(`  Path:      ${report.scannedPath}`);
  lines.push(`  Scanned:   ${report.filesScanned} files`);
  lines.push(`  Hashed:    ${report.filesHashed} files`);
  lines.push(`  Duration:  ${(report.durationMs / 1000).toFixed(1)}s`);
  lines.push('');

  if (report.groups.length === 0) {
    lines.push('  No duplicate files found.');
    lines.push('──────────────────────────────────────────────────');
    return lines.join('\n');
  }

  lines.push(
    `  Found ${report.duplicateGroupCount} duplicate group${report.duplicateGroupCount > 1 ? 's' : ''} — ${formatBytes(report.totalWastedBytes)} wasted`,
  );
  lines.push('');

  report.groups.forEach((group, idx) => {
    lines.push(`  ─── Group ${idx + 1} of ${report.groups.length} ─────────────────────────`);
    lines.push(
      `  ${formatBytes(group.sizeBytes)} × ${group.files.length} copies  (${formatBytes(group.wastedBytes)} wasted)`,
    );
    lines.push(`  Hash: ${group.hash.slice(0, 16)}...`);
    lines.push('');

    group.files.forEach((file, fIdx) => {
      const tag = fIdx === 0 ? 'ORIGINAL ' : 'DUPLICATE';
      const dateStr = new Date(file.modifiedAt).toISOString().split('T')[0];
      lines.push(`    ${tag}  ${file.path.padEnd(45)} ${dateStr}`);
    });
    lines.push('');
  });

  lines.push('──────────────────────────────────────────────────');
  lines.push(
    `  Total wasted space: ${formatBytes(report.totalWastedBytes)} across ${report.duplicateGroupCount} groups`,
  );
  lines.push('  Run `sweep dupes --clean` to remove duplicate copies interactively.');

  return lines.join('\n');
}
