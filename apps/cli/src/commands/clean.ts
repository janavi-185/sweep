import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { select } from '@inquirer/prompts';
import { DatabaseService } from '@sweep/database';
import {
  getLastScanResult,
  analyzeResult,
  detectDevStorage,
  formatBytes,
  collectAnalyzerCandidates,
  collectDevStorageCandidates,
  deleteItem,
  writeCleanupLog,
} from '@sweep/core';
import { DEV_TOOL_DEFINITIONS, ALL_SAFETY_RULES } from '@sweep/rules';
import {
  CleanupCandidate,
  CleanupItemResult,
  CleanupSessionResult,
  CleanerAction,
} from '@sweep/types';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';

export function registerCleanCommand(program: Command): void {
  program
    .command('clean')
    .option('--dry-run', 'Show what would be deleted without taking action')
    .option('--dev', 'Clean developer storage only')
    .option('--json', 'Output CleanupSessionResult as JSON')
    .description('Safely clean identified storage candidates')
    .action(
      createAsyncHandler(async (options: { dryRun?: boolean; dev?: boolean; json?: boolean }) => {
        const startedAt = new Date();
        const isDryRun = !!options.dryRun;

        const candidates: CleanupCandidate[] = [];

        // 1. Collect Dev Storage Candidates
        const devReport = await detectDevStorage(DEV_TOOL_DEFINITIONS);
        const devCandidates = collectDevStorageCandidates(devReport.tools, ALL_SAFETY_RULES);
        candidates.push(...devCandidates);

        // 2. If not --dev only, collect analyzer candidates from last scan
        if (!options.dev) {
          const lastScan = getLastScanResult();
          if (lastScan) {
            const analysis = analyzeResult(lastScan);
            const analyzerCandidates = collectAnalyzerCandidates(
              analysis.candidates,
              ALL_SAFETY_RULES,
            );
            for (const c of analyzerCandidates) {
              if (!candidates.some((existing) => existing.path === c.path)) {
                candidates.push(c);
              }
            }
          }
        }

        // If no candidates found
        if (candidates.length === 0) {
          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  startedAt,
                  completedAt: new Date(),
                  isDryRun,
                  totalCandidatesCount: 0,
                  cleanedCount: 0,
                  skippedCount: 0,
                  failedCount: 0,
                  totalFreedBytes: 0,
                  itemResults: [],
                },
                null,
                2,
              ),
            );
            return;
          }
          print.info('No cleanup candidates found. Your system looks clean!');
          return;
        }

        // Dry-Run Mode
        if (isDryRun) {
          if (options.json) {
            const simulatedResults: CleanupItemResult[] = candidates.map((c) => ({
              candidate: c,
              actionTaken: 'cleaned',
              freedBytes: c.sizeBytes,
            }));
            const totalFreed = candidates.reduce((acc, c) => acc + c.sizeBytes, 0);
            console.log(
              JSON.stringify(
                {
                  startedAt,
                  completedAt: new Date(),
                  isDryRun: true,
                  totalCandidatesCount: candidates.length,
                  cleanedCount: candidates.length,
                  skippedCount: 0,
                  failedCount: 0,
                  totalFreedBytes: totalFreed,
                  itemResults: simulatedResults,
                },
                null,
                2,
              ),
            );
            return;
          }

          console.log(chalk.bold.cyan('\n  Sweep Clean — Dry Run Mode'));
          print.divider();
          let totalDryFreed = 0;
          for (const c of candidates) {
            totalDryFreed += c.sizeBytes;
            const sizePad = formatBytes(c.sizeBytes).padStart(10);
            console.log(
              `  ${chalk.yellow('[DRY RUN]')} Would delete: ${chalk.white(c.path.padEnd(35))} ${chalk.bold.yellow(sizePad)}`,
            );
            console.log(`                       ${chalk.gray(c.explanation || c.rule.name)}`);
          }
          print.divider();
          console.log(
            chalk.bold.cyan(
              `  [DRY RUN] ${candidates.length} item${candidates.length > 1 ? 's' : ''}, ${formatBytes(totalDryFreed)} would be freed. Nothing was deleted.\n`,
            ),
          );
          return;
        }

        // Interactive Real Cleanup Session
        console.log(chalk.bold.cyan('\n  Sweep — Safe Cleanup Engine'));
        print.divider();
        console.log(
          `  Found ${chalk.bold.white(candidates.length.toString())} candidates governing ${ALL_SAFETY_RULES.length} safety rules.\n`,
        );

        let yesToAll = false;
        const itemResults: CleanupItemResult[] = [];

        for (let index = 0; index < candidates.length; index++) {
          const c = candidates[index]!;

          console.log(chalk.bold.cyan(`  Item ${index + 1} of ${candidates.length}`));
          print.divider();
          console.log(`  ${chalk.gray('Path:')}     ${chalk.white(c.path)}`);
          console.log(
            `  ${chalk.gray('Size:')}     ${chalk.bold.yellow(formatBytes(c.sizeBytes))}`,
          );
          console.log(`  ${chalk.gray('Rule:')}     ${chalk.cyan(c.rule.name)}`);
          console.log(`  ${chalk.gray('Details:')}  ${c.rule.description}`);
          console.log(`  ${chalk.gray('Safety:')}   ${chalk.green(c.rule.whySafeToRemove)}\n`);

          let action: CleanerAction = 'yes';

          if (yesToAll) {
            action = 'yes';
          } else {
            try {
              action = (await select({
                message: 'What would you like to do?',
                choices: [
                  { name: '✔ Delete this item', value: 'yes' },
                  { name: '✖ Skip this item', value: 'no' },
                  { name: '⏩ Delete this and ALL remaining items', value: 'all' },
                  { name: '⏹ Quit cleanup session', value: 'quit' },
                ],
              })) as CleanerAction;
            } catch {
              action = 'quit';
            }
          }

          if (action === 'quit') {
            console.log(chalk.yellow('\n  Cleanup session aborted by user.'));
            break;
          }

          if (action === 'all') {
            yesToAll = true;
            action = 'yes';
          }

          if (action === 'no') {
            itemResults.push({
              candidate: c,
              actionTaken: 'skipped',
              freedBytes: 0,
            });
            console.log(chalk.gray('  – Skipped\n'));
            continue;
          }

          // Execute deletion safely
          const spinner = ora(`Deleting ${c.name}...`).start();
          const res = await deleteItem(c, false);

          if (res.actionTaken === 'cleaned') {
            spinner.succeed(`Deleted — ${formatBytes(res.freedBytes)} freed\n`);
          } else {
            spinner.fail(`Failed: ${res.error || 'Unknown error'}\n`);
          }

          itemResults.push(res);
        }

        const completedAt = new Date();
        const cleanedCount = itemResults.filter((r) => r.actionTaken === 'cleaned').length;
        const skippedCount = itemResults.filter((r) => r.actionTaken === 'skipped').length;
        const failedCount = itemResults.filter((r) => r.actionTaken === 'failed').length;
        const totalFreedBytes = itemResults.reduce((acc, r) => acc + r.freedBytes, 0);

        const sessionResult: CleanupSessionResult = {
          startedAt,
          completedAt,
          isDryRun: false,
          totalCandidatesCount: candidates.length,
          cleanedCount,
          skippedCount,
          failedCount,
          totalFreedBytes,
          itemResults,
        };

        // Record cleanup events in SQLite Database
        try {
          const db = new DatabaseService();
          const nowIso = completedAt.toISOString();
          const events = itemResults
            .filter((r) => r.actionTaken === 'cleaned')
            .map((r) => ({
              path: r.candidate.path,
              size_bytes: r.freedBytes,
              rule_id: r.candidate.rule.id,
              confirmed_at: nowIso,
            }));
          if (events.length > 0) {
            db.insertCleanupEvents(events);
          }
          db.close();
        } catch {
          // Non-blocking database recording
        }

        if (options.json) {
          console.log(JSON.stringify(sessionResult, null, 2));
          return;
        }

        const logPath = writeCleanupLog(sessionResult);

        console.log(chalk.bold.cyan('\n  Cleanup Complete'));
        print.divider();
        console.log(
          `  ${chalk.gray('Deleted:')}   ${chalk.bold.green(cleanedCount.toString())} items    ${chalk.bold.green(formatBytes(totalFreedBytes))} freed`,
        );
        console.log(`  ${chalk.gray('Skipped:')}   ${skippedCount} items`);
        console.log(`  ${chalk.gray('Failed:')}    ${failedCount} items`);
        if (logPath) {
          console.log(`  ${chalk.gray('Log written to:')} ${logPath}`);
        }
        print.divider();
        console.log('');
      }),
    );
}
