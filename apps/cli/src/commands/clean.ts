import { Command } from 'commander';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerCleanCommand(program: Command): void {
  program
    .command('clean')
    .option('--dry-run', 'Show cleanup candidates without deleting')
    .option('--dev', 'Clean developer-specific storage only')
    .description('Show cleanup candidates and ask for confirmation')
    .action(
      createAsyncHandler(async (options: { dryRun?: boolean; dev?: boolean }) => {
        if (options.dryRun) {
          print.info('Running in dry-run mode (no files will be deleted)');
        }
        if (options.dev) {
          print.info('Filtering for developer storage candidates');
        }
        print.stub('clean', 'Phase 5 (Safe Cleanup Engine)');
      }),
    );
}
