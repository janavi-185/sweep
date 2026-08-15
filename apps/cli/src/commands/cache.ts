import { Command } from 'commander';
import chalk from 'chalk';
import { CacheService, formatBytes } from '@sweep/core';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerCacheCommand(program: Command): void {
  const cacheCmd = program.command('cache').description('Manage SQLite-backed scan cache');

  cacheCmd
    .command('status')
    .description('Show cache statistics, entry counts, and size on disk')
    .action(
      createAsyncHandler(async () => {
        const cache = new CacheService();
        const stats = cache.getDbStats();
        cache.close();

        console.log(chalk.bold.cyan('\n  Cache Status'));
        print.divider();
        console.log(`  ${chalk.gray('Entries:')}      ${stats.entryCount.toLocaleString()}`);
        console.log(`  ${chalk.gray('Size on disk:')} ${formatBytes(stats.totalSizeBytes)}`);
        if (stats.oldestEntry) {
          const dateStr = new Date(stats.oldestEntry).toISOString().replace('T', ' ').slice(0, 16);
          console.log(`  ${chalk.gray('Oldest entry:')} ${dateStr}`);
        }
        print.divider();
        console.log('');
      }),
    );

  cacheCmd
    .command('clear')
    .description('Clear all cached directory scan entries from memory and database')
    .action(
      createAsyncHandler(async () => {
        const cache = new CacheService();
        const clearedCount = cache.clearAll();
        cache.close();
        print.success(`Cleared ${clearedCount} cache entries.`);
      }),
    );
}
