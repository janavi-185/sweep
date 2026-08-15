import { Command } from 'commander';
import ora from 'ora';
import { findDuplicates, formatDuplicateReport } from '@sweep/core';
import { createAsyncHandler } from '../utils/async-handler';

export function registerDupesCommand(program: Command): void {
  program
    .command('dupes [targetPath]')
    .option(
      '--min-size <bytes>',
      'Minimum file size in bytes to consider (default: 1MB)',
      '1048576',
    )
    .option('--json', 'Output raw DuplicateReport as JSON')
    .description('Find duplicate files in a directory using a two-pass algorithm')
    .action(
      createAsyncHandler(
        async (targetPath: string | undefined, options: { minSize?: string; json?: boolean }) => {
          const path = targetPath || '.';
          const minSizeBytes = parseInt(options.minSize || '1048576', 10);

          let spinner: ReturnType<typeof ora> | undefined;

          if (!options.json) {
            spinner = ora('Scanning directory for duplicate file candidates...').start();
          }

          const report = await findDuplicates(path, {
            minSizeBytes,
            onProgress: (hashed, total, currentPath) => {
              if (spinner) {
                const filename = currentPath.split('/').pop() || currentPath;
                spinner.text = `Hashing files... [${hashed}/${total}] ${filename}`;
              }
            },
          });

          if (spinner) {
            spinner.succeed(
              `Hashed ${report.filesHashed} files in ${(report.durationMs / 1000).toFixed(1)}s\n`,
            );
          }

          if (options.json) {
            console.log(JSON.stringify(report, null, 2));
            return;
          }

          console.log(formatDuplicateReport(report));
        },
      ),
    );
}
