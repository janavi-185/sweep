import { Command } from 'commander';
import chalk from 'chalk';
import { DatabaseService } from '@sweep/database';
import { formatBytes } from '@sweep/core';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerHistoryCommand(program: Command): void {
  program
    .command('history')
    .option('--scans', 'Show scan history only')
    .option('--cleanups', 'Show cleanup history only')
    .option('--limit <n>', 'Limit output count', '10')
    .option('--json', 'Output history as raw JSON')
    .description('View scan history and safe cleanup audit log from database')
    .action(
      createAsyncHandler(
        async (options: {
          scans?: boolean;
          cleanups?: boolean;
          limit?: string;
          json?: boolean;
        }) => {
          const db = new DatabaseService();
          const limit = parseInt(options.limit || '10', 10);

          const showScans = options.scans || (!options.scans && !options.cleanups);
          const showCleanups = options.cleanups || (!options.scans && !options.cleanups);

          const scans = showScans ? db.getRecentScans(limit) : [];
          const cleanups = showCleanups ? db.getRecentCleanupEvents(limit) : [];
          const totalCleaned = db.getTotalByteCleaned();

          db.close();

          if (options.json) {
            console.log(
              JSON.stringify({ scans, cleanups, totalCleanedBytes: totalCleaned }, null, 2),
            );
            return;
          }

          console.log(chalk.bold.cyan('\n  Sweep — History & Audit Log'));
          print.divider();

          if (showScans) {
            console.log(chalk.bold.white('  Scan History'));
            print.divider();
            if (scans.length === 0) {
              console.log('  No past scans recorded yet.\n');
            } else {
              scans.forEach((s) => {
                const date = new Date(s.scanned_at).toISOString().replace('T', ' ').slice(0, 16);
                console.log(
                  `  #${s.id.toString().padEnd(4)} ${s.root_path.padEnd(25)} ${date}  ${(s.duration_ms / 1000).toFixed(1)}s  ${s.file_count} files  ${formatBytes(s.total_size_bytes)}`,
                );
              });
              console.log('');
            }
          }

          if (showCleanups) {
            console.log(chalk.bold.white('  Cleanup Audit Log'));
            print.divider();
            if (cleanups.length === 0) {
              console.log('  No past cleanup events recorded yet.\n');
            } else {
              cleanups.forEach((c) => {
                const date = new Date(c.cleaned_at).toISOString().replace('T', ' ').slice(0, 16);
                console.log(
                  `  ${date}  [${c.rule_id.padEnd(18)}]  ${c.path.padEnd(35)}  ${formatBytes(c.size_bytes)}`,
                );
              });
              console.log('');
              console.log(
                chalk.bold.green(
                  `  Total freed across all sessions: ${formatBytes(totalCleaned)}\n`,
                ),
              );
            }
          }
        },
      ),
    );
}
