import { Command } from 'commander';
import { CLI_VERSION } from './utils/version';
import { registerScanCommand } from './commands/scan';
import { registerAnalyzeCommand } from './commands/analyze';
import { registerCleanCommand } from './commands/clean';
import { registerDupesCommand } from './commands/dupes';
import { registerDevCommand } from './commands/dev';
import { registerHistoryCommand } from './commands/history';
import { registerConfigCommand } from './commands/config';
import { registerCacheCommand } from './commands/cache';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('sweep')
    .description('Developer-focused macOS storage analyzer and safe cleanup CLI')
    .version(CLI_VERSION, '-v, --version', 'Output the current version of Sweep');

  registerScanCommand(program);
  registerAnalyzeCommand(program);
  registerCleanCommand(program);
  registerDupesCommand(program);
  registerDevCommand(program);
  registerHistoryCommand(program);
  registerConfigCommand(program);
  registerCacheCommand(program);

  return program;
}

export function runCli(): void {
  const program = createProgram();
  program.parse(process.argv);
}

runCli();
