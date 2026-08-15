import { Command } from 'commander';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .option('--json', 'Output raw JSON report')
    .description('Show developer-specific storage usage')
    .action(
      createAsyncHandler(async (_options: { json?: boolean }) => {
        print.stub('dev', 'Phase 4 (Developer Storage Detection)');
      }),
    );
}
