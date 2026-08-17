import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import https from 'node:https';
import os from 'node:os';
import { print } from '../utils/output';
import { createAsyncHandler } from '../utils/async-handler';
import { CLI_VERSION } from '../utils/version';

const REPO = 'janavi-185/sweep';
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'sweep-cli-updater',
        Accept: 'application/vnd.github.v3+json',
      },
    };
    const req = https
      .get(url, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            return fetchJson<T>(redirectUrl).then(resolve).catch(reject);
          }
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP Error ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);

    req.setTimeout(5000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

function isNewerVersion(remoteTag: string, localVersion: string): boolean {
  const remoteClean = remoteTag.replace(/^v/, '');
  const localClean = localVersion.replace(/^v/, '');

  const remoteParts = remoteClean.split('.').map(Number);
  const localParts = localClean.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const r = remoteParts[i] || 0;
    const l = localParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .option('--check', 'Check for updates without downloading')
    .description('Check for updates and self-update Sweep CLI from GitHub Releases')
    .action(
      createAsyncHandler(async (options: { check?: boolean }) => {
        console.log(chalk.bold.cyan('\n  Sweep — Update Manager'));
        print.divider();
        console.log(`  Current Version: ${chalk.bold.white(CLI_VERSION)}`);

        const spinner = ora('Checking GitHub Releases for updates...').start();

        try {
          const release = await fetchJson<ReleaseInfo>(LATEST_RELEASE_URL);
          const latestTag = release.tag_name;

          if (!isNewerVersion(latestTag, CLI_VERSION)) {
            spinner.succeed(`Sweep is up to date (${CLI_VERSION})`);
            console.log('');
            return;
          }

          spinner.info(`New version available: ${chalk.bold.green(latestTag)}`);

          if (options.check) {
            console.log(
              `  Run ${chalk.cyan('sweep update')} to download and install ${latestTag}.\n`,
            );
            return;
          }

          const arch = os.arch() === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
          const binaryAsset = release.assets.find((a) => a.name === `sweep-${arch}`);
          const checksumAsset = release.assets.find((a) => a.name === `sweep-${arch}.sha256`);

          if (!binaryAsset || !checksumAsset) {
            console.log(
              chalk.yellow(
                `  To update to ${latestTag}, re-run:\n  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | sh\n`,
              ),
            );
            return;
          }

          console.log(`  Update instructions for ${latestTag}:`);
          console.log(
            `  Run: ${chalk.cyan(`curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | sh`)}\n`,
          );
        } catch (err) {
          const is404 = err instanceof Error && err.message.includes('404');
          if (is404) {
            spinner.succeed(`Sweep is up to date (${CLI_VERSION})`);
            console.log(chalk.gray('  No newer release tags found on GitHub.\n'));
          } else {
            spinner.info(
              `Could not connect to GitHub Releases: ${err instanceof Error ? err.message : String(err)}`,
            );
            console.log(
              chalk.gray(`  Visit https://github.com/${REPO}/releases to check for releases.\n`),
            );
          }
        }
      }),
    );
}
