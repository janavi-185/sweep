import { Command } from 'commander';
import chalk from 'chalk';
import { getLastScanResult, analyzeResult, formatBytes } from '@sweep/core';
import { print, renderBarChart } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .option('--top <n>', 'Show top N largest items', '10')
    .option('--json', 'Output raw JSON report')
    .description('Analyze the last scan result')
    .action(
      createAsyncHandler(async (options: { top?: string; json?: boolean }) => {
        let topN = options.top ? parseInt(options.top, 10) : 10;
        if (isNaN(topN) || topN <= 0) {
          print.warn('Top value must be a positive integer, defaulting to 10.');
          topN = 10;
        }

        const lastScan = getLastScanResult();
        if (!lastScan) {
          print.error('No scan result available. Run `sweep scan <path>` first.');
          process.exit(1);
        }

        const analysis = analyzeResult(lastScan, { topN });

        if (options.json) {
          console.log(JSON.stringify(analysis, null, 2));
          return;
        }

        const { scanResult, breakdown, topFiles, topDirectories, candidates } = analysis;

        console.log(chalk.bold.cyan('\n  Sweep Analysis'));
        print.divider();
        console.log(`  ${chalk.gray('Scan path:')}   ${scanResult.rootPath}`);
        console.log(
          `  ${chalk.gray('Analyzed:')}    ${new Date(analysis.analyzedAt).toLocaleString()}`,
        );
        console.log(
          `  ${chalk.gray('Total size:')}  ${chalk.bold.white(formatBytes(breakdown.totalBytes))} across ${scanResult.fileCount.toLocaleString()} files`,
        );

        if (breakdown.byCategory.length > 0) {
          console.log(chalk.bold.cyan('\n  Storage by Category'));
          print.divider();
          for (const cat of breakdown.byCategory) {
            const namePad = cat.category.padEnd(12);
            const sizePad = formatBytes(cat.sizeBytes).padEnd(10);
            const bar = renderBarChart(cat.percentage, 32);
            const pct = `${cat.percentage.toFixed(0).padStart(3)}%`;
            console.log(`  ${namePad} ${sizePad} ${bar} ${pct}`);
          }
        }

        if (topFiles.length > 0) {
          console.log(chalk.bold.cyan(`\n  Top ${Math.min(topN, topFiles.length)} Largest Files`));
          print.divider();
          topFiles.slice(0, topN).forEach((file, index) => {
            const rank = (index + 1).toString().padStart(3);
            const fileName = file.name.length > 24 ? `${file.name.substring(0, 21)}...` : file.name;
            const namePad = fileName.padEnd(25);
            const sizePad = formatBytes(file.sizeBytes).padEnd(10);
            console.log(
              `  ${chalk.gray(rank)}  ${chalk.white(namePad)} ${sizePad} ${chalk.gray(file.path)}`,
            );
          });
        }

        if (topDirectories.length > 0) {
          console.log(
            chalk.bold.cyan(`\n  Top ${Math.min(topN, topDirectories.length)} Largest Directories`),
          );
          print.divider();
          topDirectories.slice(0, topN).forEach((dir, index) => {
            const rank = (index + 1).toString().padStart(3);
            const dirName = `${dir.name}/`;
            const namePad = dirName.length > 24 ? `${dirName.substring(0, 21)}...` : dirName;
            const sizePad = formatBytes(dir.sizeBytes).padEnd(10);
            console.log(
              `  ${chalk.gray(rank)}  ${chalk.white(namePad)} ${sizePad} ${chalk.gray(dir.path)}`,
            );
          });
        }

        console.log(chalk.bold.cyan('\n  Cleanup Candidates'));
        print.divider();

        if (candidates.length === 0) {
          console.log(
            chalk.gray('  No obvious cleanup candidates found. Your system looks clean!'),
          );
        } else {
          const totalCandidateBytes = candidates.reduce((acc, c) => acc + c.sizeBytes, 0);
          console.log(
            chalk.yellow(
              `  ⚠  ${candidates.length} item${candidates.length > 1 ? 's' : ''} identified — ${formatBytes(totalCandidateBytes)} could be freed\n`,
            ),
          );

          for (const c of candidates) {
            const tag = `[${c.reason}]`.padEnd(17);
            const sizePad = formatBytes(c.sizeBytes).padStart(10);
            console.log(
              `  ${chalk.cyan(tag)} ${chalk.white(c.path.padEnd(35))} ${chalk.bold.yellow(sizePad)}`,
            );
            console.log(`                    ${chalk.gray(c.explanation)}\n`);
          }
        }

        print.divider();
        console.log(`  Run ${chalk.cyan('sweep clean')} to review and remove candidates.\n`);
      }),
    );
}
