import chalk from 'chalk';
import boxen from 'boxen';

export function renderBarChart(percentage: number, length = 16): string {
  const filledLength = Math.round((percentage / 100) * length);
  const emptyLength = length - filledLength;
  const filled = '█'.repeat(Math.max(0, filledLength));
  const empty = '░'.repeat(Math.max(0, emptyLength));
  return chalk.cyan(filled) + chalk.gray(empty);
}

export const print = {
  info: (msg: string): void => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string): void => console.log(chalk.green('✔'), msg),
  warn: (msg: string): void => console.log(chalk.yellow('⚠'), msg),
  error: (msg: string): void => console.error(chalk.red('✖'), msg),
  header: (title: string): void => console.log(chalk.bold.cyan(`\n  Sweep — ${title}\n`)),
  divider: (): void => console.log(chalk.gray('─'.repeat(50))),
  stub: (commandName: string, phaseName: string): void => {
    console.log(
      boxen(
        `${chalk.bold.cyan(`Sweep — ${commandName}`)}\n\n${chalk.dim(`This feature will be fully implemented in ${phaseName}.`)}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        },
      ),
    );
  },
};
