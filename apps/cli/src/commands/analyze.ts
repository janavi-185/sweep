import { Command } from 'commander';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .option('--top <n>', 'Show top N largest items', '10')
    .option('--json', 'Output raw JSON report')
    .description('Analyze the last scan result')
    .action(
      createAsyncHandler(async (_options: { top?: string; json?: boolean }) => {
        print.stub('analyze', 'Phase 3 (Storage Analyzer & Reporting)');
      }),
    );
}
