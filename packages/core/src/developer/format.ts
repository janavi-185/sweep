import { DevStorageReport } from '../types';
import { formatBytes } from '../scanner/metadata';

export function formatDevStorageReport(report: DevStorageReport): string {
  const lines: string[] = [];

  lines.push('\n  Sweep — Developer Storage');
  lines.push('─'.repeat(50));
  lines.push(
    `  Detected ${report.installedCount} of ${report.tools.length} developer tools installed\n`,
  );

  const installedTools = report.tools.filter((t) => t.isInstalled);
  const notInstalledTools = report.tools.filter((t) => !t.isInstalled);

  for (const item of installedTools) {
    const namePad = item.tool.name.padEnd(35);
    const sizePad = formatBytes(item.totalSizeBytes).padStart(10);
    lines.push(`  ${namePad} ${sizePad}`);

    for (const p of item.measuredPaths) {
      if (p.exists) {
        const labelPad = `  ${p.label}`.padEnd(20);
        const pathPad = p.path.padEnd(30);
        const subSizePad = formatBytes(p.sizeBytes).padStart(10);
        lines.push(`    ${labelPad} ${pathPad} ${subSizePad}`);
      }
    }
    lines.push('');
  }

  if (notInstalledTools.length > 0) {
    lines.push('─'.repeat(50));
    const names = notInstalledTools.map((t) => t.tool.name).join(', ');
    lines.push(`  Not installed: ${names}`);
  }

  lines.push('─'.repeat(50));
  lines.push(`  Total developer storage: ${formatBytes(report.grandTotalBytes)}`);
  lines.push('  Run sweep clean --dev to review safe cleanup options.\n');

  return lines.join('\n');
}
