import { Command } from 'commander';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerConfigCommand(program: Command): void {
  const config = program.command('config').description('View or edit Sweep settings');

  config
    .command('get [key]')
    .description('Get configuration setting value')
    .action(
      createAsyncHandler(async (key?: string) => {
        if (key) {
          print.info(`Getting config key: ${key}`);
        }
        print.stub('config get', 'Phase 7 (SQLite Persistence & Config)');
      }),
    );

  config
    .command('set <key> <value>')
    .description('Set configuration setting value')
    .action(
      createAsyncHandler(async (key: string, value: string) => {
        print.info(`Setting config key: ${key} = ${value}`);
        print.stub('config set', 'Phase 7 (SQLite Persistence & Config)');
      }),
    );
}
