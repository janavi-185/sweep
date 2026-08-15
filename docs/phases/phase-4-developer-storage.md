# Phase 4 — Developer Storage Detection

> **Goal:** Identify and report storage consumed by developer tools and their caches on macOS.
> This phase is **read-only** — the `dev` command surfaces sizes and locations but takes no action.
> A developer should be able to see exactly how much disk space Xcode, Docker, npm, and a dozen other tools are consuming, at a glance.

---

## Objectives

- Implement `DevStorageDetector` module in `packages/core/developer/`
- Define structured tool definitions in `packages/rules/` — one entry per developer tool
- Check all known macOS developer tool paths and aggregate their sizes
- Skip silently when a tool is not installed (path does not exist)
- Implement the `stacksweep dev` CLI command
- Output results grouped by tool, with individual path sizes and totals
- Unit test with a mocked filesystem

---

## Core Module: `packages/core/developer`

```
packages/core/src/
└── developer/
    ├── index.ts            # Public API: detectDevStorage()
    ├── detector.ts         # Reads each DevToolDefinition, measures paths
    └── format.ts           # Terminal output formatter for dev report
```

```
packages/rules/src/
└── developer/
    ├── index.ts            # Exports all tool definitions as an array
    ├── xcode.ts
    ├── docker.ts
    ├── npm.ts
    ├── pnpm.ts
    ├── yarn.ts
    ├── gradle.ts
    ├── android.ts
    ├── python.ts
    ├── homebrew.ts
    ├── cocoapods.ts
    ├── rust.ts
    └── java.ts
```

---

## Data Model

```typescript
// packages/types/src/developer.ts

/**
 * A structured definition for a single developer tool.
 * Defined statically in packages/rules/developer/.
 */
export interface DevToolDefinition {
  id: string                    // e.g. 'xcode', 'docker', 'npm'
  name: string                  // Human-readable name: "Xcode", "Docker Desktop"
  description: string           // One-line description of what this tool stores
  paths: DevToolPath[]          // One or more paths to measure
  isSafeToClean: boolean        // Whether Phase 5 can safely offer cleanup
  website?: string              // Optional link shown in output for context
}

export interface DevToolPath {
  path: string                  // Absolute path, may use ~ for home dir
  label: string                 // Human-readable label for this path in the report
  description: string           // What is stored here (shown as tooltip in output)
}

/**
 * The measured result for a single developer tool.
 * Produced at runtime by detector.ts.
 */
export interface DevToolResult {
  tool: DevToolDefinition
  isInstalled: boolean          // false if none of the paths exist
  totalSizeBytes: number
  measuredPaths: MeasuredPath[]
}

export interface MeasuredPath {
  path: string
  label: string
  sizeBytes: number
  exists: boolean
}

/**
 * The complete output of detectDevStorage().
 */
export interface DevStorageReport {
  generatedAt: Date
  tools: DevToolResult[]
  grandTotalBytes: number       // Sum of all installed tool sizes
  installedCount: number
  notInstalledCount: number
}
```

---

## Developer Tool Definitions (`packages/rules/developer/`)

Each file exports a single `DevToolDefinition`. All are re-exported from `index.ts`.

### Xcode — `xcode.ts`

```typescript
export const xcode: DevToolDefinition = {
  id: 'xcode',
  name: 'Xcode',
  description: 'Build artifacts, device support files, and app archives',
  isSafeToClean: true,
  paths: [
    {
      path: '~/Library/Developer/Xcode/DerivedData',
      label: 'Derived Data',
      description: 'Build artifacts generated per-project. Fully regeneratable.',
    },
    {
      path: '~/Library/Developer/Xcode/Archives',
      label: 'Archives',
      description: 'App archives created for distribution. Keep if you need to re-sign.',
    },
    {
      path: '~/Library/Developer/Xcode/iOS DeviceSupport',
      label: 'iOS Device Support',
      description: 'Debug symbols downloaded per iOS device + version. Safe to remove for old versions.',
    },
    {
      path: '~/Library/Developer/CoreSimulator/Caches',
      label: 'Simulator Caches',
      description: 'Simulator runtime caches. Regenerated on next launch.',
    },
  ],
}
```

### Docker — `docker.ts`

```typescript
export const docker: DevToolDefinition = {
  id: 'docker',
  name: 'Docker Desktop',
  description: 'Container images, volumes, and Docker Desktop data',
  isSafeToClean: false,   // Needs user to run docker system prune — Phase 5 will handle
  paths: [
    {
      path: '~/Library/Containers/com.docker.docker',
      label: 'Docker Desktop Data',
      description: 'Docker Desktop VM disk image and settings. Contains all images and volumes.',
    },
    {
      path: '~/.docker',
      label: 'Docker Config',
      description: 'Docker CLI config, credentials, and context files.',
    },
  ],
}
```

### npm — `npm.ts`

```typescript
export const npm: DevToolDefinition = {
  id: 'npm',
  name: 'npm',
  description: 'npm global cache and any local node_modules found',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.npm',
      label: 'npm Cache',
      description: 'Global npm package cache. Cleared with `npm cache clean --force`.',
    },
  ],
}
```

> **Note on `node_modules` scanning:** `node_modules` directories are deliberately excluded from this static path list. They are detected dynamically by the scanner (Phase 2) when the user runs `stacksweep scan` on a project directory. Surfacing them here would require a recursive search that is too slow and scope-inappropriate for this command.

### pnpm — `pnpm.ts`

```typescript
export const pnpm: DevToolDefinition = {
  id: 'pnpm',
  name: 'pnpm',
  description: 'pnpm content-addressable store',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.pnpm-store',
      label: 'pnpm Store',
      description: 'Content-addressable package store shared across all projects.',
    },
    {
      path: '~/Library/pnpm/store',
      label: 'pnpm Store (alternate)',
      description: 'Alternate store location used by newer pnpm versions.',
    },
  ],
}
```

### Yarn — `yarn.ts`

```typescript
export const yarn: DevToolDefinition = {
  id: 'yarn',
  name: 'Yarn',
  description: 'Yarn global package cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.yarn/cache',
      label: 'Yarn Cache',
      description: 'Global Yarn classic cache. Cleared with `yarn cache clean`.',
    },
    {
      path: '~/Library/Caches/yarn',
      label: 'Yarn Cache (Berry)',
      description: 'Cache used by Yarn Berry (v2+).',
    },
  ],
}
```

### Gradle — `gradle.ts`

```typescript
export const gradle: DevToolDefinition = {
  id: 'gradle',
  name: 'Gradle',
  description: 'Gradle build cache and downloaded dependencies',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.gradle/caches',
      label: 'Gradle Caches',
      description: 'Downloaded dependencies and build cache. Redownloaded as needed.',
    },
    {
      path: '~/.gradle/wrapper',
      label: 'Gradle Wrapper',
      description: 'Downloaded Gradle distribution versions.',
    },
  ],
}
```

### Android SDK — `android.ts`

```typescript
export const android: DevToolDefinition = {
  id: 'android',
  name: 'Android SDK',
  description: 'Android SDK, emulator images, and build tools',
  isSafeToClean: false,   // Deletions require SDK manager — Phase 5 will handle
  paths: [
    {
      path: '~/Library/Android/sdk',
      label: 'Android SDK',
      description: 'Full Android SDK installation. Managed via Android Studio SDK Manager.',
    },
  ],
}
```

### Python — `python.ts`

```typescript
export const python: DevToolDefinition = {
  id: 'python',
  name: 'Python',
  description: 'pyenv versions, virtualenvs, and pip cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.pyenv',
      label: 'pyenv',
      description: 'Python versions managed by pyenv.',
    },
    {
      path: '~/.virtualenvs',
      label: 'virtualenvwrapper envs',
      description: 'Virtual environments created by virtualenvwrapper.',
    },
    {
      path: '~/Library/Caches/pip',
      label: 'pip Cache',
      description: 'pip download cache. Cleared with `pip cache purge`.',
    },
  ],
}
```

### Homebrew — `homebrew.ts`

```typescript
export const homebrew: DevToolDefinition = {
  id: 'homebrew',
  name: 'Homebrew',
  description: 'Homebrew package cache and installed formulae',
  isSafeToClean: true,
  paths: [
    {
      // Path is resolved at runtime via `brew --cache` — see detector.ts
      path: '~/Library/Caches/Homebrew',
      label: 'Homebrew Cache',
      description: 'Downloaded package sources and bottles. Cleared with `brew cleanup`.',
    },
    {
      path: '/opt/homebrew/Cellar',
      label: 'Homebrew Cellar (Apple Silicon)',
      description: 'Installed Homebrew formulae on Apple Silicon.',
    },
    {
      path: '/usr/local/Cellar',
      label: 'Homebrew Cellar (Intel)',
      description: 'Installed Homebrew formulae on Intel Macs.',
    },
  ],
}
```

### CocoaPods — `cocoapods.ts`

```typescript
export const cocoapods: DevToolDefinition = {
  id: 'cocoapods',
  name: 'CocoaPods',
  description: 'CocoaPods spec repo and download cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.cocoapods',
      label: 'CocoaPods Cache',
      description: 'Spec repo and downloaded pod sources. Refreshed via `pod install`.',
    },
  ],
}
```

### Rust / Cargo — `rust.ts`

```typescript
export const rust: DevToolDefinition = {
  id: 'rust',
  name: 'Rust / Cargo',
  description: 'Cargo registry and compiled crate cache',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.cargo/registry',
      label: 'Cargo Registry',
      description: 'Downloaded crate sources and compiled crates. Cleared with `cargo cache -a`.',
    },
    {
      path: '~/.cargo/git',
      label: 'Cargo Git Cache',
      description: 'Crates fetched directly from git repositories.',
    },
  ],
}
```

### Java / Maven — `java.ts`

```typescript
export const java: DevToolDefinition = {
  id: 'java',
  name: 'Java / Maven',
  description: 'Maven local repository of downloaded JARs and dependencies',
  isSafeToClean: true,
  paths: [
    {
      path: '~/.m2',
      label: 'Maven Local Repository',
      description: 'Downloaded Maven artifacts. Redownloaded from central on next build.',
    },
  ],
}
```

---

## Detector Logic

### `detectDevStorage(definitions: DevToolDefinition[]): Promise<DevStorageReport>`

```typescript
// packages/core/src/developer/detector.ts

async function measurePath(p: string): Promise<{ sizeBytes: number; exists: boolean }> {
  const resolved = p.replace('~', os.homedir())
  try {
    await fs.access(resolved)          // Throws if not accessible
    const size = await getDirSize(resolved)
    return { sizeBytes: size, exists: true }
  } catch {
    return { sizeBytes: 0, exists: false }
  }
}
```

**For each `DevToolDefinition`:**
1. Expand `~` in each path to the actual home directory using `os.homedir()`
2. Call `measurePath()` for each path in the definition
3. A tool is `isInstalled: true` if **at least one** of its paths exists
4. Sum all existing path sizes → `totalSizeBytes`
5. Collect into `DevToolResult`

**Performance:** All path measurements run concurrently via `Promise.all()` per tool, and tools themselves are measured concurrently.

---

## CLI Command: `dev`

```bash
stacksweep dev [options]

Options:
  --json        Output raw JSON DevStorageReport
  -h, --help    Display help for command
```

---

## Terminal Output

```
  StackSweep — Developer Storage
  ─────────────────────────────────────────
  Detected 9 of 12 tools installed

  Xcode                                    42.3 GB
    Derived Data        ~/Library/Developer/Xcode/DerivedData   38.1 GB
    Archives            ~/Library/Developer/Xcode/Archives       3.9 GB
    iOS Device Support  ~/Library/Developer/Xcode/iOS Dev…       310 MB

  Docker Desktop                           18.7 GB
    Docker Desktop Data ~/Library/Containers/com.docker.docker  18.7 GB
    Docker Config       ~/.docker                                 1.2 MB

  npm                                       2.1 GB
    npm Cache           ~/.npm                                    2.1 GB

  pnpm                                      1.4 GB
    pnpm Store          ~/.pnpm-store                            1.4 GB

  Yarn                                      890 MB
    Yarn Cache          ~/.yarn/cache                            890 MB

  Rust / Cargo                              760 MB
    Cargo Registry      ~/.cargo/registry                        620 MB
    Cargo Git Cache     ~/.cargo/git                             140 MB

  Java / Maven                              430 MB
    Maven Local Repo    ~/.m2                                    430 MB

  Python                                    280 MB
    pyenv               ~/.pyenv                                 210 MB
    pip Cache           ~/Library/Caches/pip                      70 MB

  Homebrew                                  190 MB
    Homebrew Cache      ~/Library/Caches/Homebrew                190 MB
    Homebrew Cellar     /opt/homebrew/Cellar                       — (not measured, in use)

  ─────────────────────────────────────────
  Not installed: Gradle, Android SDK, CocoaPods

  ─────────────────────────────────────────
  Total developer storage:  67.1 GB

  Run `stacksweep clean --dev` to review safe cleanup options.
```

---

## Edge Cases

| Edge case | Handling |
|---|---|
| Tool not installed (no paths exist) | `isInstalled: false` — omit from main output, list in "Not installed" summary at bottom |
| Path exists but is empty | `sizeBytes: 0` — show as `0 B`, do not skip |
| Permission denied when measuring a path | Record `sizeBytes: 0`, append `(permission denied)` label in output |
| Homebrew installed at non-standard path | Both `/opt/homebrew` (Apple Silicon) and `/usr/local` (Intel) paths are checked — whichever exists is measured |
| `~/.pnpm-store` and `~/Library/pnpm/store` both exist | Both are measured and both appear in output — user may have both |
| Tool is installed but paths are empty | `isInstalled: true`, `totalSizeBytes: 0` — still shown, not hidden |
| `--json` flag | Serialize full `DevStorageReport` to stdout |

---

## Unit Tests

All tests use a mocked filesystem via `vi.mock('fs/promises')` in Vitest.

- `detector.ts` — installed tool: all paths exist → `isInstalled: true`, sizes summed correctly
- `detector.ts` — not installed: no paths exist → `isInstalled: false`, `totalSizeBytes: 0`
- `detector.ts` — partial install: only one of two paths exists → `isInstalled: true`, only that path's size counted
- `detector.ts` — permission error on path → `sizeBytes: 0`, `exists: false` for that path, tool still shown
- `detector.ts` — concurrent measurement: assert `Promise.all` is used (no sequential awaits in loop)
- `format.ts` — `formatReport()`: given a `DevStorageReport` fixture, assert output contains correct tool names and sizes
- `format.ts` — not-installed tools appear in footer, not in main list

---

## Deliverables for Phase 4

- [ ] `packages/types/src/developer.ts` — `DevToolDefinition`, `DevToolPath`, `DevToolResult`, `MeasuredPath`, `DevStorageReport` defined and exported
- [ ] `packages/rules/src/developer/xcode.ts` — definition with all 4 paths
- [ ] `packages/rules/src/developer/docker.ts`
- [ ] `packages/rules/src/developer/npm.ts`
- [ ] `packages/rules/src/developer/pnpm.ts`
- [ ] `packages/rules/src/developer/yarn.ts`
- [ ] `packages/rules/src/developer/gradle.ts`
- [ ] `packages/rules/src/developer/android.ts`
- [ ] `packages/rules/src/developer/python.ts`
- [ ] `packages/rules/src/developer/homebrew.ts` — both Cellar paths (Intel + Apple Silicon)
- [ ] `packages/rules/src/developer/cocoapods.ts`
- [ ] `packages/rules/src/developer/rust.ts`
- [ ] `packages/rules/src/developer/java.ts`
- [ ] `packages/rules/src/developer/index.ts` — re-exports all 12 definitions as array
- [ ] `packages/core/src/developer/detector.ts` — `detectDevStorage()` with concurrent measurement
- [ ] `packages/core/src/developer/format.ts` — terminal report formatter
- [ ] `packages/core/src/developer/index.ts` — public API exported
- [ ] `apps/cli/commands/dev.ts` — full command implementation with `--json` flag
- [ ] Not-installed tools shown in footer, not in main output
- [ ] Permission errors handled gracefully — no crash
- [ ] Unit tests for detector and formatter with mocked filesystem
- [ ] CI passing

---

*Previous: [Phase 3 — Storage Analyzer & Reporting](./phase-3-storage-analyzer.md)*
*Next: [Phase 5 — Safe Cleanup Engine](./phase-5-safe-cleanup.md)*

---

### Completion Status Summary & Executable Commands
**Status**: Fully Implemented & Completed.
- Created 13 modular developer tool definitions in `packages/rules/src/developer/` (`xcode`, `docker`, `npm`, `pnpm`, `yarn`, `gradle`, `android`, `python`, `homebrew`, `cocoapods`, `rust`, `java`, `flutter`).
- Implemented `detectDevStorage()` detector in `packages/core/src/developer/detector.ts` with concurrent `Promise.all` path measuring.
- Created terminal report formatter in `packages/core/src/developer/format.ts`.
- Implemented `sweep dev` CLI subcommand in `apps/cli/src/commands/dev.ts` with live spinner and `--json` flag.

**Commands User Can Execute Now**:
- `sweep dev [--json]`: Detects and reports developer tool storage on macOS.
