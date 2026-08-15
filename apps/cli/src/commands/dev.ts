import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { detectDevStorage, formatBytes } from '@sweep/core';
import { DEV_TOOL_DEFINITIONS } from '@sweep/rules';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .option('--json', 'Output raw JSON report')
    .description('Detect and report developer tools storage usage')
    .action(
      createAsyncHandler(async (options: { json?: boolean }) => {
        if (options.json) {
          const report = await detectDevStorage(DEV_TOOL_DEFINITIONS);
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        const spinner = ora({
          text: 'Scanning developer tools storage...',
          color: 'cyan',
        }).start();

        let report;
        try {
          report = await detectDevStorage(DEV_TOOL_DEFINITIONS);
          spinner.succeed('Developer storage scan completed');
        } catch (err) {
          spinner.fail(
            `Developer storage scan failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }

        console.log(chalk.bold.cyan('\n  Sweep — Developer Storage'));
        print.divider();
        console.log(
          `  ${chalk.gray('Detected')} ${chalk.bold.white(report.installedCount.toString())} of ${report.tools.length} developer tools installed\n`,
        );

        const installedTools = report.tools.filter((t) => t.isInstalled);
        const notInstalledTools = report.tools.filter((t) => !t.isInstalled);

        for (const item of installedTools) {
          const namePad = item.tool.name.padEnd(35);
          const sizePad = formatBytes(item.totalSizeBytes).padStart(10);
          console.log(`  ${chalk.bold.white(namePad)} ${chalk.bold.yellow(sizePad)}`);

          for (const p of item.measuredPaths) {
            if (p.exists) {
              const labelPad = `  ${p.label}`.padEnd(20);
              const pathPad = p.path.padEnd(30);
              const subSizePad = formatBytes(p.sizeBytes).padStart(10);
              console.log(
                `    ${chalk.cyan(labelPad)} ${chalk.gray(pathPad)} ${chalk.white(subSizePad)}`,
              );
            }
          }
          console.log('');
        }

        if (notInstalledTools.length > 0) {
          print.divider();
          const names = notInstalledTools.map((t) => t.tool.name).join(', ');
          console.log(`  ${chalk.gray('Not installed:')} ${chalk.gray(names)}`);
        }

        print.divider();
        console.log(
          `  ${chalk.bold.gray('Total developer storage:')}  ${chalk.bold.cyan(formatBytes(report.grandTotalBytes))}`,
        );
        console.log(`  Run ${chalk.cyan('sweep clean --dev')} to review safe cleanup options.\n`);
      }),
    );
}
