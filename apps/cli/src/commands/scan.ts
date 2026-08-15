import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import { scanDirectory, formatBytes } from '@sweep/core';
import { print, renderBarChart } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .argument('[path]', 'Directory to scan', '.')
    .option('--depth <n>', 'Maximum directory depth')
    .option('--json', 'Output raw JSON report')
    .description('Scan a directory and report storage usage')
    .action(
      createAsyncHandler(
        async (targetPath: string, options: { depth?: string; json?: boolean }) => {
          const parsedDepth = options.depth ? parseInt(options.depth, 10) : undefined;
          if (options.depth && (isNaN(parsedDepth!) || parsedDepth! < 0)) {
            print.error('Depth must be a positive number');
            process.exit(1);
          }

          const resolvedPath = path.resolve(targetPath);

          // If JSON output requested, do not print spinner or terminal headers
          if (options.json) {
            const result = await scanDirectory(targetPath, { maxDepth: parsedDepth });
            console.log(JSON.stringify(result, null, 2));
            return;
          }

          const spinner = ora({
            text: `Scanning... ${resolvedPath}`,
            color: 'cyan',
          }).start();

          let scannedResult;
          try {
            scannedResult = await scanDirectory(
              targetPath,
              { maxDepth: parsedDepth },
              (count, currentPath) => {
                spinner.text = `Scanning... ${currentPath} (${count.toLocaleString()} files so far)`;
              },
            );
            spinner.succeed(`Scan completed in ${(scannedResult.durationMs / 1000).toFixed(1)}s`);
          } catch (err) {
            spinner.fail(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }

          // Formatted Terminal Report
          console.log(chalk.bold.cyan('\n  Sweep Scan'));
          print.divider();
          console.log(`  ${chalk.gray('Path:')}        ${scannedResult.rootPath}`);
          console.log(
            `  ${chalk.gray('Scanned:')}     ${scannedResult.fileCount.toLocaleString()} files in ${scannedResult.directoryCount.toLocaleString()} directories`,
          );
          console.log(
            `  ${chalk.gray('Total size:')}  ${chalk.bold.white(formatBytes(scannedResult.totalSizeBytes))}`,
          );
          console.log(
            `  ${chalk.gray('Duration:')}    ${(scannedResult.durationMs / 1000).toFixed(1)}s`,
          );

          if (scannedResult.categories.length > 0) {
            console.log(chalk.bold.cyan('\n  Storage by Category'));
            print.divider();
            for (const cat of scannedResult.categories) {
              const namePad = cat.category.padEnd(12);
              const sizePad = formatBytes(cat.sizeBytes).padEnd(10);
              const bar = renderBarChart(cat.percentage);
              const pct = `${cat.percentage.toFixed(0).padStart(3)}%`;
              console.log(`  ${namePad} ${sizePad} ${bar} ${pct}`);
            }
          }

          if (scannedResult.largestFiles.length > 0) {
            console.log(chalk.bold.cyan('\n  Largest Files'));
            print.divider();
            for (const file of scannedResult.largestFiles.slice(0, 5)) {
              const fileName =
                file.name.length > 24 ? `${file.name.substring(0, 21)}...` : file.name;
              const namePad = fileName.padEnd(25);
              const sizePad = formatBytes(file.sizeBytes).padEnd(10);
              console.log(`  ${chalk.white(namePad)} ${sizePad} ${chalk.gray(file.path)}`);
            }
          }

          if (scannedResult.largestDirectories.length > 0) {
            console.log(chalk.bold.cyan('\n  Largest Directories'));
            print.divider();
            for (const dir of scannedResult.largestDirectories.slice(0, 5)) {
              const dirName = `${dir.name}/`;
              const namePad = dirName.length > 24 ? `${dirName.substring(0, 21)}...` : dirName;
              const sizePad = formatBytes(dir.sizeBytes).padEnd(10);
              console.log(
                `  ${chalk.white(namePad.padEnd(25))} ${sizePad} ${chalk.gray(dir.path)}`,
              );
            }
          }

          print.divider();
          if (scannedResult.skippedCount > 0) {
            console.log(
              chalk.yellow(
                `  Skipped ${scannedResult.skippedCount} items (permission denied / unreadable)`,
              ),
            );
          }
          console.log(
            chalk.gray('  Run ') +
              chalk.cyan('sweep analyze') +
              chalk.gray(' for a deeper breakdown.\n'),
          );
        },
      ),
    );
}
