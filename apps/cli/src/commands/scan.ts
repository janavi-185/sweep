import { Command } from 'commander';
import { print } from '../utils/output';
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
          print.info(`Target directory: ${targetPath}`);
          if (options.depth) {
            print.info(`Max depth: ${options.depth}`);
          }
          print.stub('scan', 'Phase 2 (Filesystem Scanner)');
        },
      ),
    );
}
