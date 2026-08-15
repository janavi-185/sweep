import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Command } from 'commander';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function getConfigPath(): string {
  return path.join(os.homedir(), '.sweep', 'config.json');
}

export function readUserConfig(): Record<string, unknown> {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return { defaultScanDepth: 10, logLevel: 'normal' };
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return { defaultScanDepth: 10, logLevel: 'normal' };
  }
}

export function writeUserConfig(config: Record<string, unknown>): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage user configuration in ~/.sweep/config.json');

  configCmd
    .command('get <key>')
    .description('Get a setting value from config.json')
    .action(
      createAsyncHandler(async (key: string) => {
        const config = readUserConfig();
        if (key in config) {
          console.log(config[key]);
        } else {
          print.error(`Key "${key}" not found in config.`);
        }
      }),
    );

  configCmd
    .command('set <key> <value>')
    .description('Set a setting value in config.json')
    .action(
      createAsyncHandler(async (key: string, value: string) => {
        const config = readUserConfig();
        let parsedValue: unknown = value;
        if (!isNaN(Number(value))) {
          parsedValue = Number(value);
        } else if (value.toLowerCase() === 'true') {
          parsedValue = true;
        } else if (value.toLowerCase() === 'false') {
          parsedValue = false;
        }

        config[key] = parsedValue;
        writeUserConfig(config);
        print.success(`Updated ~/.sweep/config.json: ${key} = ${value}`);
      }),
    );
}
