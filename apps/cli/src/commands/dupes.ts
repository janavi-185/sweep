import { Command } from 'commander';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerDupesCommand(program: Command): void {
  program
    .command('dupes')
    .argument('[path]', 'Directory to scan for duplicates', '.')
    .option('--min-size <bytes>', 'Minimum file size to consider', '1048576')
    .option('--json', 'Output raw JSON report')
    .description('Find duplicate files in a directory')
    .action(
      createAsyncHandler(
        async (targetPath: string, _options: { minSize?: string; json?: boolean }) => {
          print.info(`Searching duplicates in: ${targetPath}`);
          print.stub('dupes', 'Phase 6 (Duplicate File Finder)');
        },
      ),
    );
}
