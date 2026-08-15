import { AnalysisResult } from '../types';
import { formatBytes } from '../scanner/metadata';

export function render32ColBarChart(percentage: number, length = 32): string {
  const filledLength = Math.round((percentage / 100) * length);
  const emptyLength = length - filledLength;
  const filled = '█'.repeat(Math.max(0, filledLength));
  const empty = '░'.repeat(Math.max(0, emptyLength));
  return filled + empty;
}

export function formatAnalysisReport(analysis: AnalysisResult, topN = 10): string {
  const lines: string[] = [];
  const { scanResult, breakdown, topFiles, topDirectories, candidates } = analysis;

  lines.push('\n  Sweep Analysis');
  lines.push('─'.repeat(50));
  lines.push(`  Scan path:   ${scanResult.rootPath}`);
  lines.push(`  Analyzed:    ${new Date(analysis.analyzedAt).toLocaleString()}`);
  lines.push(
    `  Total size:  ${formatBytes(breakdown.totalBytes)} across ${scanResult.fileCount.toLocaleString()} files`,
  );

  if (breakdown.byCategory.length > 0) {
    lines.push('\n  Storage by Category');
    lines.push('─'.repeat(50));
    for (const cat of breakdown.byCategory) {
      const namePad = cat.category.padEnd(12);
      const sizePad = formatBytes(cat.sizeBytes).padEnd(10);
      const bar = render32ColBarChart(cat.percentage, 32);
      const pct = `${cat.percentage.toFixed(0).padStart(3)}%`;
      lines.push(`  ${namePad} ${sizePad} ${bar} ${pct}`);
    }
  }

  if (topFiles.length > 0) {
    lines.push(`\n  Top ${Math.min(topN, topFiles.length)} Largest Files`);
    lines.push('─'.repeat(50));
    topFiles.slice(0, topN).forEach((file, index) => {
      const rank = (index + 1).toString().padStart(3);
      const fileName = file.name.length > 24 ? `${file.name.substring(0, 21)}...` : file.name;
      const namePad = fileName.padEnd(25);
      const sizePad = formatBytes(file.sizeBytes).padEnd(10);
      lines.push(`  ${rank}  ${namePad} ${sizePad} ${file.path}`);
    });
  }

  if (topDirectories.length > 0) {
    lines.push(`\n  Top ${Math.min(topN, topDirectories.length)} Largest Directories`);
    lines.push('─'.repeat(50));
    topDirectories.slice(0, topN).forEach((dir, index) => {
      const rank = (index + 1).toString().padStart(3);
      const dirName = `${dir.name}/`;
      const namePad = dirName.length > 24 ? `${dirName.substring(0, 21)}...` : dirName;
      const sizePad = formatBytes(dir.sizeBytes).padEnd(10);
      lines.push(`  ${rank}  ${namePad} ${sizePad} ${dir.path}`);
    });
  }

  lines.push('\n  Cleanup Candidates');
  lines.push('─'.repeat(50));

  if (candidates.length === 0) {
    lines.push('  No obvious cleanup candidates found. Your system looks clean!');
  } else {
    const totalCandidateBytes = candidates.reduce((acc, c) => acc + c.sizeBytes, 0);
    lines.push(
      `  ⚠  ${candidates.length.toLocaleString()} item${candidates.length > 1 ? 's' : ''} identified — ${formatBytes(totalCandidateBytes)} could be freed\n`,
    );

    const displayedCandidates = candidates.slice(0, topN);
    for (const c of displayedCandidates) {
      const tag = `[${c.reason}]`.padEnd(17);
      const sizePad = formatBytes(c.sizeBytes).padStart(10);
      lines.push(`  ${tag} ${c.path.padEnd(35)} ${sizePad}`);
      lines.push(`                    ${c.explanation}\n`);
    }

    if (candidates.length > topN) {
      const remainingCount = candidates.length - topN;
      lines.push(
        `  ... and ${remainingCount.toLocaleString()} more candidates (run sweep analyze --json for complete list)\n`,
      );
    }
  }

  lines.push('─'.repeat(50));
  lines.push('  Run sweep clean to review and remove candidates.\n');

  return lines.join('\n');
}
