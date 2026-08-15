# Phase 1 — CLI Foundation

> **Goal:** Bootstrap a working CLI executable with Commander.js.
> Users can run `stacksweep` in their terminal and see help, version info, and placeholder command outputs.

---

## Objectives

- Setup `apps/cli` package structure using Commander.js
- Implement `-v, --version` and `-h, --help` flags
- Register all planned subcommands with stubbed actions
- Set up `tsup` build configuration to bundle CLI binary
- Implement terminal formatting helpers in `utils/output.ts`
- Make binary executable via shebang (`#!/usr/bin/env node`)

---

## Architecture Overview

```
apps/cli/src/
├── index.ts               # Program entry point (Commander setup)
├── commands/
│   ├── scan.ts            # stacksweep scan [path]
│   ├── analyze.ts         # stacksweep analyze
│   ├── clean.ts           # stacksweep clean
│   ├── dupes.ts           # stacksweep dupes [path]
│   ├── dev.ts             # stacksweep dev
│   ├── history.ts         # stacksweep history
│   └── config.ts          # stacksweep config
└── utils/
    ├── output.ts          # Chalk/boxen formatting helpers
    └── version.ts         # Dynamic version reader from package.json
```

---

## Subcommand Definitions

Every command is defined in its own file in `commands/`. Each exports a registration function that registers the command with Commander.

```typescript
// apps/cli/src/commands/scan.ts (Phase 1 stub)
import { Command } from 'commander'

export function registerScanCommand(program: Command) {
  program
    .command('scan')
    .argument('[path]', 'Directory to scan', '.')
    .option('--depth <n>', 'Maximum directory depth')
    .option('--json', 'Output raw JSON report')
    .description('Scan a directory and report storage usage')
    .action(async (path, options) => {
      // Phase 1 stub — prints placeholder output
      console.log(`Scan command called for: ${path}`)
      console.log('Feature arriving in Phase 2.')
    })
}
```

---

## CLI Entrypoint (`apps/cli/src/index.ts`)

```typescript
#!/usr/bin/env node
import { Command } from 'commander'
import { getVersion } from './utils/version'
import { registerScanCommand } from './commands/scan'
import { registerAnalyzeCommand } from './commands/analyze'
import { registerCleanCommand } from './commands/clean'
import { registerDupesCommand } from './commands/dupes'
import { registerDevCommand } from './commands/dev'
import { registerHistoryCommand } from './commands/history'
import { registerConfigCommand } from './commands/config'

const program = new Command()

program
  .name('stacksweep')
  .description('Developer-focused macOS storage analyzer & cleanup tool')
  .version(getVersion(), '-v, --version')

registerScanCommand(program)
registerAnalyzeCommand(program)
registerCleanCommand(program)
registerDupesCommand(program)
registerDevCommand(program)
registerHistoryCommand(program)
registerConfigCommand(program)

program.parse(process.argv)
```

---

## Terminal Output Formatting (`utils/output.ts`)

Use `chalk` for color and `boxen` for styled boxes.

```typescript
import chalk from 'chalk'
import boxen from 'boxen'

export const print = {
  header: (title: string) => console.log(chalk.bold.cyan(`\n  StackSweep — ${title}\n`)),
  info:    (msg: string)   => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string)   => console.log(chalk.green('✔'), msg),
  warning: (msg: string)   => console.log(chalk.yellow('⚠'), msg),
  error:   (msg: string)   => console.log(chalk.red('✖'), msg),
  divider: ()              => console.log(chalk.gray('─'.repeat(50))),
  box:     (text: string)  => console.log(boxen(text, { padding: 1, borderStyle: 'round' })),
}
```

---

## Build Configuration (`apps/cli/tsup.config.ts`)

Use `tsup` (powered by esbuild) to bundle `apps/cli` into a single, executable JavaScript file.

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node18',
  clean: true,
  bundle: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
```

Running `pnpm --filter @sweep/cli build` produces `apps/cli/dist/index.js`.

---

## Command Registry

| Command | Status | Description |
|---|---|---|
| `stacksweep scan [path]` | Stubbed | Scan a directory and report storage usage |
| `stacksweep analyze` | Stubbed | Deep breakdown of last scan result |
| `stacksweep clean` | Stubbed | Interactive safe cleanup |
| `stacksweep dupes [path]` | Stubbed | Find duplicate files |
| `stacksweep dev` | Stubbed | Developer storage detection |
| `stacksweep history` | Stubbed | Scan and cleanup history |
| `stacksweep config` | Stubbed | View or edit configuration settings |

---

## Error Handling Pattern

Every command action handler is wrapped to catch unexpected runtime errors gracefully:

```typescript
function createAsyncHandler(fn: Function) {
  return async (...args: any[]) => {
    try {
      await fn(...args)
    } catch (err) {
      print.error((err as Error).message)
      process.exit(1)
    }
  }
}
```

---

## CI & Testing Strategy

- `apps/cli` is built and linted in CI alongside `packages/*`
- Test: execute `stacksweep --help` and assert exit code is 0
- Test: execute `stacksweep --version` and assert output matches `package.json`

### CI additions in Phase 1
- TypeScript compilation of `apps/cli`
- ESLint on all CLI source files
- Running tests

No changes to CI needed in this phase.

---

## Deliverables for Phase 1

- [ ] `apps/cli/src/index.ts` bootstrapped with Commander.js
- [ ] All planned commands stubbed with placeholder output
- [ ] `utils/output.ts` print helpers implemented
- [ ] `tsup` build pipeline working
- [ ] `stacksweep --help` shows all commands correctly
- [ ] `stacksweep --version` outputs current semver version
- [ ] Shebang line present in output — script is executable
- [ ] All stub commands exit cleanly with code 0
- [ ] Unit tests for output utilities passing
- [ ] Integration test: CLI spawns and `--help` output is asserted
- [ ] CI passing

---

*Previous: [Phase 0 — Architecture](./phase-0-architecture.md)*
*Next: [Phase 2 — Filesystem Scanner](./phase-2-filesystem-scanner.md)*

---

### Completion Status Summary
**Status**: Fully Implemented & Completed.
- Modular CLI application in `apps/cli` built with Commander.js.
- Clean subcommand structure (`scan`, `analyze`, `clean`, `dupes`, `dev`, `history`, `config`).
- Output formatting helpers with `chalk` and `boxen` (`utils/output.ts`).
- `tsup` build configuration producing standalone `dist/index.js` executable.
- Globally runnable executable (`sweep --help`, `sweep --version`).
