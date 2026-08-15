# Phase 0 — Architecture & Project Foundation

> **Goal:** Establish the complete project skeleton before writing a single line of application logic.
> Every future phase builds on top of this foundation.

---

## Objectives

- Design and document the monorepo architecture
- Set up pnpm workspaces
- Configure TypeScript across all packages
- Establish code quality tooling (ESLint, Prettier)
- Set up GitHub Actions CI from day one
- Create folder structure for all planned packages and apps

---

## Monorepo Structure

```
stacksweep/
│
├── apps/
│   ├── cli/                    # CLI application (Phase 1+)
│   └── desktop/                # Desktop app (Phase 11, planned)
│
├── packages/
│   ├── core/                   # Scanner, Analyzer, Cleaner, Cache engine
│   ├── database/               # SQLite access layer (Phase 7)
│   ├── types/                  # Shared TypeScript types and interfaces
│   └── rules/                  # Cleanup safety rules and definitions
│
├── scripts/
│   ├── install.sh              # curl installer script (Phase 10)
│   └── release.sh              # Release helper
│
├── tests/                      # Integration and E2E tests
├── docs/
│   └── phases/                 # This folder
│
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint + typecheck + test on every push/PR
│       └── release.yml         # Build binary + GitHub Release on tag push
│
├── package.json                # Root workspace config
├── pnpm-workspace.yaml         # pnpm workspace definition
├── tsconfig.base.json          # Shared TypeScript config
├── .eslintrc.json
├── .prettierrc
└── README.md
```

---

## Package Responsibilities

### `packages/types`
- All shared TypeScript interfaces and types
- No runtime dependencies
- Example types: `ScanResult`, `FileEntry`, `CleanupCandidate`, `SafetyRule`
- **Must be set up first** — everything depends on it

### `packages/rules`
- JSON or TypeScript definitions for cleanup safety rules
- Each rule defines: what to target, why it is safe, category, confirmation message
- No runtime logic — pure data definitions
- Example: `XcodeDerivedData`, `NpmCache`, `HomebrewCache`

### `packages/core`
- The brain of StackSweep
- Modules: `scanner`, `analyzer`, `cleaner`, `cache`, `duplicates`, `developer`
- Depends on: `types`, `rules`
- Has zero CLI or UI knowledge — pure logic

### `packages/database`
- SQLite abstraction layer
- Tables: `scans`, `cleanup_events`, `settings`, `cache_entries`
- Depends on: `types`
- Introduced in Phase 7, stubbed here

### `apps/cli`
- Thin interface over `core`
- Depends on: `core`, `types`, `database`
- Uses Commander.js for argument parsing
- Formats and prints results — no business logic

### `apps/desktop` *(placeholder — Phase 11)*
- Tauri v2 + React
- Same core engine as CLI
- Stubbed folder created now, built later

---

## TypeScript Configuration

```json
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist"
  }
}
```

Each package extends `tsconfig.base.json` and sets its own `rootDir` and `outDir`.

Strictness is high from day one — this prevents entire categories of bugs later.

---

## Code Quality Tooling

### ESLint
- `@typescript-eslint/recommended`
- `no-floating-promises` — all async errors must be handled
- `no-unused-vars` — no dead code
- `prefer-const` — immutability by default

### Prettier
- 2-space indentation
- Single quotes
- Trailing commas where valid
- 100-character line length

### Pre-commit hooks
- Use `simple-git-hooks` + `lint-staged`
- On commit: lint + format changed files only

---

## GitHub Actions: CI Workflow

File: `.github/workflows/ci.yml`

```yaml
Trigger: push to any branch, pull_request to main

Steps:
  1. Checkout code
  2. Install pnpm
  3. Install dependencies (pnpm install --frozen-lockfile)
  4. Type check all packages (tsc --noEmit)
  5. Lint all packages (eslint)
  6. Run all tests (vitest)
  7. Build all packages (pnpm build)
```

This runs on **every push and every PR**. No code merges to `main` without passing CI.

### Branch Protection Rules (set up on GitHub)
- Require CI to pass before merging
- No direct pushes to `main`
- Require pull request reviews (even for solo dev — good habit)

---

## GitHub Actions: Release Workflow

File: `.github/workflows/release.yml`

```yaml
Trigger: push of a tag matching v* (e.g. v0.1.0)

Steps:
  1. Run full CI
  2. Build standalone binaries for:
     - macOS arm64 (Apple Silicon)
     - macOS x64 (Intel)
  3. Create GitHub Release with:
     - Release notes (auto-generated from commits)
     - Binary attachments
     - SHA256 checksums
  4. Update install.sh to point to latest release
```

This is scaffolded in Phase 0 even though the binary doesn't exist yet. The workflow fails gracefully until there is something to build.

---

## Testing Setup

- **Framework:** Vitest
- **Unit tests:** live next to source files (`*.test.ts`)
- **Integration tests:** `tests/` folder at root
- **Coverage:** collected but not enforced until Phase 3+

---

## Deliverables for Phase 0

- [ ] Repository created on GitHub
- [ ] Monorepo folder structure created
- [ ] `pnpm-workspace.yaml` configured
- [ ] `tsconfig.base.json` and per-package `tsconfig.json` files in place
- [ ] ESLint + Prettier configured
- [ ] `simple-git-hooks` + `lint-staged` configured
- [ ] `ci.yml` GitHub Action created and passing
- [ ] `release.yml` GitHub Action scaffolded (will evolve in Phase 10)
- [ ] Branch protection rules enabled on GitHub
- [ ] `packages/types` bootstrapped with placeholder types
- [ ] `packages/rules` bootstrapped with empty rule definitions
- [ ] Root `README.md` updated with project overview and dev setup instructions
- [ ] All packages have `package.json` with correct `name`, `main`, `types` fields

---

## Notes

- Do not start Phase 1 until all deliverables above are checked off.
- The `packages/database` and `apps/desktop` folders are created as stubs now but intentionally left empty.
- Config files (`.eslintrc`, `.prettierrc`) live at the root and apply to all packages.
- pnpm is used instead of npm for workspace support and disk efficiency.

---

*Next: [Phase 1 — CLI Foundation](./phase-1-cli-foundation.md)*

---

### Completion Status Summary
**Status**: Fully Implemented & Completed.
- Monorepo configured with pnpm workspaces (`@sweep/core`, `@sweep/database`, `@sweep/cli`, `@sweep/desktop`).
- GitHub Actions CI pipeline (`ci.yml`) and Release pipeline (`release.yml`) active.
- TypeScript, ESLint, Prettier, `simple-git-hooks`, and Vitest suite verified.
