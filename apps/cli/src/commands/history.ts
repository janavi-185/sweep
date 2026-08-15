import { Command } from 'commander';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerHistoryCommand(program: Command): void {
  program
    .command('history')
    .option('--scans', 'Show scan history only')
    .option('--cleanups', 'Show cleanup history only')
    .description('Show past scan and cleanup history')
    .action(
      createAsyncHandler(async (_options: { scans?: boolean; cleanups?: boolean }) => {
        print.stub('history', 'Phase 7 (SQLite Persistence)');
      }),
    );
}
