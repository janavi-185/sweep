# Phase 1 — CLI Foundation

> **Goal:** A working CLI binary that users can run. No real functionality yet — just the shell of a great tool.
> After this phase, `stacksweep --help` and `stacksweep --version` work correctly, and all commands are stubbed.

---

## Objectives

- Bootstrap `apps/cli` as a working Node.js CLI application
- Integrate Commander.js for argument and command parsing
- Define all planned commands as stubs (they print "coming soon" for now)
- Set up the CLI build pipeline to produce a runnable script
- Wire the CLI into the root dev/build scripts

---

## Tech

| Tool | Purpose |
|---|---|
| `commander` | Argument parsing, subcommands, help text |
| `chalk` | Coloured terminal output |
| `ora` | Spinner for async operations |
| `boxen` | Styled terminal boxes for reports |
| `tsup` | Fast TypeScript bundler for the CLI output |

---

## CLI Commands (all stubbed in this phase)

```
stacksweep [options] [command]

Options:
  -v, --version       Output the version number
  -h, --help          Display help

Commands:
  scan [path]         Scan a directory and report storage usage
  analyze             Analyze the last scan result
  clean               Show cleanup candidates and ask for confirmation
  dupes [path]        Find duplicate files in a directory
  dev                 Show developer-specific storage usage
  history             Show past scan and cleanup history
  config              View or edit StackSweep settings
  help [command]      Display help for a command
```

### Stub output example
```
$ stacksweep scan ~/Downloads

  StackSweep — scan
  This feature is coming in Phase 2.
```

---

## Entry Point

```
apps/cli/
├── src/
│   ├── index.ts          # Entry point — sets up Commander program
│   ├── commands/
│   │   ├── scan.ts       # scan command stub
│   │   ├── analyze.ts    # analyze command stub
│   │   ├── clean.ts      # clean command stub
│   │   ├── dupes.ts      # dupes command stub
│   │   ├── dev.ts        # dev command stub
│   │   ├── history.ts    # history command stub
│   │   └── config.ts     # config command stub
│   └── utils/
│       ├── output.ts     # Shared print helpers (success, error, info, warn)
│       └── version.ts    # Reads version from package.json
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## Build Pipeline

`tsup` is used to bundle `apps/cli/src/index.ts` into `apps/cli/dist/index.js`.

The `package.json` for `apps/cli` includes:

```json
{
  "bin": {
    "stacksweep": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs --target node18",
    "dev": "tsup src/index.ts --format cjs --target node18 --watch"
  }
}
```

The output file must start with `#!/usr/bin/env node` shebang so it is executable.

---

## Output Conventions

Establish output helpers in `utils/output.ts` now — every command will use them.

```typescript
// utils/output.ts
export const print = {
  info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string) => console.log(chalk.green('✔'), msg),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
  error: (msg: string) => console.error(chalk.red('✖'), msg),
  header: (title: string) => console.log(chalk.bold.white(`\n  ${title}\n`)),
  divider: () => console.log(chalk.gray('─'.repeat(50))),
}
```

All future commands use these — never raw `console.log` with inline styling.

---

## Version Management

- Version is stored **only** in `apps/cli/package.json`
- `--version` reads it at runtime — never hardcoded
- Version format: `0.1.0` (semver)

---

## Error Handling Convention (establish now)

```typescript
// All async command handlers follow this pattern:
async function run() {
  try {
    // command logic
  } catch (err) {
    print.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
```

No unhandled promise rejections. Ever.

---

## Dev Workflow

```bash
# From root
pnpm dev          # Watch mode — rebuilds CLI on file change

# Run the CLI directly during development
node apps/cli/dist/index.js scan ~/Downloads

# Or link it globally for easier testing
pnpm link --global
stacksweep --help
```

---

## Testing

- Unit test the `output.ts` utilities
- Integration test: spawn CLI process and assert stdout output
- Test that `--help` outputs all expected commands
- Test that `--version` outputs a valid semver string

---

## CI Integration

Phase 0's CI workflow already covers:
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
