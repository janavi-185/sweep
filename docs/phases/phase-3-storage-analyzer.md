# Phase 3 — Storage Analyzer & Reporting

> **Goal:** Build the analyzer layer on top of scanner results.
> The `analyze` CLI command produces a deeper, insight-focused report from the last scan — identifying storage patterns, surfacing obvious cleanup candidates, and presenting the data in a readable, actionable format.
> Everything in this phase is **read-only**. No deletions, no confirmations, no prompts.

---

## Objectives

- Implement the `Analyzer` module in `packages/core/analyzer/`
- Define `AnalysisResult`, `CleanupCandidate`, and `StorageBreakdown` types
- Identify obvious cleanup candidates (Trash, stale Downloads, caches) — surface them with explanations, but take no action
- Chain `analyze` automatically after `scan` completes
- Render a rich terminal report with ASCII bar charts
- Support `--top <n>` flag to control how many files/directories are listed
- Add the `stacksweep analyze` standalone command that re-analyzes the last scan

---

## Core Module: `packages/core/analyzer`

```
packages/core/src/
└── analyzer/
    ├── index.ts            # Public API: analyzeResult()
    ├── breakdown.ts        # Compute StorageBreakdown from ScanResult
    ├── candidates.ts       # Identify CleanupCandidates from ScanResult
    ├── format.ts           # ASCII bar chart and report formatting helpers
    └── rules.ts            # Built-in heuristic rules for candidate identification
```

---

## Data Model

```typescript
// packages/types/src/analyzer.ts

import { FileEntry, DirectoryEntry, FileCategory, ScanResult } from './scanner'

/**
 * The top-level result produced by the analyzer.
 * Wraps a ScanResult with derived insights.
 */
export interface AnalysisResult {
  scanResult: ScanResult
  analyzedAt: Date
  breakdown: StorageBreakdown
  topFiles: FileEntry[]               // Sorted by sizeBytes descending
  topDirectories: DirectoryEntry[]    // Sorted by sizeBytes descending
  candidates: CleanupCandidate[]
}

/**
 * Storage breakdown by category, sorted by sizeBytes descending.
 */
export interface StorageBreakdown {
  totalBytes: number
  byCategory: CategoryBreakdown[]
}

export interface CategoryBreakdown {
  category: FileCategory
  sizeBytes: number
  fileCount: number
  percentage: number          // rounded to 1 decimal place
}

/**
 * A file or directory identified as a likely cleanup target.
 * No action is taken — this is identification only.
 */
export interface CleanupCandidate {
  path: string
  sizeBytes: number
  reason: CandidateReason       // machine-readable reason code
  explanation: string           // human-readable explanation shown in the report
  category: CandidateCategory
  isSafeToClean: boolean        // Phase 5 will gate on this
}

export type CandidateReason =
  | 'trash'                     // ~/.Trash contents
  | 'stale_downloads'           // Downloads older than 30 days
  | 'large_cache'               // Cache directory above threshold
  | 'old_logs'                  // Log files older than 30 days
  | 'temp_files'                // .tmp / .temp files
  | 'duplicate'                 // Will be populated in Phase 6

export type CandidateCategory =
  | 'system'
  | 'user_data'
  | 'cache'
  | 'logs'
  | 'developer'
```

---

## Analyzer Logic

### `analyzeResult(scanResult: ScanResult, options?: AnalyzeOptions): AnalysisResult`

The main entry point. Takes a completed `ScanResult` and returns an `AnalysisResult`.

```typescript
export interface AnalyzeOptions {
  topN?: number         // How many top files/dirs to surface (default: 10)
}
```

**Steps performed:**
1. Compute `StorageBreakdown` — group entries by category, calculate percentages
2. Sort all `FileEntry` items by `sizeBytes` descending → take top N
3. Sort all `DirectoryEntry` items by `sizeBytes` descending → take top N
4. Run candidate identification rules (see below)
5. Return the assembled `AnalysisResult`

---

## Candidate Identification Rules

Defined in `packages/core/analyzer/rules.ts`. Each rule is a pure function with the signature:

```typescript
type CandidateRule = (entries: FsEntry[], scanRoot: string) => CleanupCandidate[]
```

### Built-in rules for Phase 3

| Rule | Trigger condition | Explanation shown to user |
|---|---|---|
| `trashRule` | Any entry under `~/.Trash` | "This file is in your Trash and can be permanently deleted." |
| `staleDownloadsRule` | Files in `~/Downloads` with `modifiedAt` older than 30 days | "This file in Downloads has not been touched in over 30 days." |
| `largeCacheRule` | Any directory whose name contains `Cache` or `cache` and `sizeBytes > 100MB` | "This cache directory is large and can typically be regenerated automatically." |
| `oldLogsRule` | Files with `.log` extension or inside a `Logs/` directory, `modifiedAt` older than 30 days | "This log file is over 30 days old and is safe to remove." |
| `tempFilesRule` | Files with `.tmp` or `.temp` extension | "Temporary files left behind by applications — safe to remove." |

Each rule produces zero or more `CleanupCandidate` objects. Rules are run sequentially and their results are concatenated. Duplicates (same path matched by two rules) are deduplicated — first match wins.

---

## Chaining: `scan` → `analyze`

After `scanDirectory()` completes successfully, the `scan` command automatically calls `analyzeResult()` with `topN: 10` and appends a summary section to the terminal output.

```
  ─────────────────────────────────────────
  Analysis
  ─────────────────────────────────────────
  Found 4 cleanup candidates (2.1 GB total)

    ~/.Trash               1.4 GB   Trash contents
    ~/Downloads/old.zip    340 MB   Not opened in 47 days
    ~/Library/Caches/...   280 MB   Cache directory
    ~/Downloads/setup.dmg  145 MB   Not opened in 62 days

  Run `stacksweep analyze` for the full breakdown.
  Run `stacksweep clean` to review and remove candidates.
```

The full analysis report is only rendered when `stacksweep analyze` is run directly.

---

## CLI Command: `analyze`

```bash
stacksweep analyze [options]

Options:
  --top <n>     Number of top files and directories to display (default: 10)
  --json        Output raw JSON instead of formatted report
  -h, --help    Display help for command
```

`analyze` re-uses the last in-memory `ScanResult` if called immediately after `scan` in the same session. In Phase 7, it will read the persisted last scan from the database.

For Phase 3: if `analyze` is run without a prior `scan` in the session, print an error and exit:

```
  ✖ No scan result available. Run `stacksweep scan <path>` first.
```

---

## Terminal Output: Full Analysis Report

```
  StackSweep Analysis
  ─────────────────────────────────────────
  Scan path:   /Users/janavi/Downloads
  Analyzed:    2026-08-15 at 13:14
  Total size:  18.42 GB across 1,284 files

  Storage by Category
  ─────────────────────────────────────────
  Videos       8.2 GB   ████████████████░░░░░░░░░░░░░░░░   44%
  Archives     4.1 GB   ████████░░░░░░░░░░░░░░░░░░░░░░░░   22%
  Documents    2.7 GB   █████░░░░░░░░░░░░░░░░░░░░░░░░░░░   15%
  Images       1.8 GB   ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   10%
  Other        1.6 GB   ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    9%

  Top 10 Largest Files
  ─────────────────────────────────────────
   1   movie.mkv               4.2 GB   /Users/janavi/Downloads/
   2   project-backup.zip      1.8 GB   /Users/janavi/Downloads/
   3   old-backup.tar.gz       960 MB   /Users/janavi/Downloads/archive/
   4   Xcode_14.dmg            7.5 GB   /Users/janavi/Downloads/
   5   footage-raw.mov         3.1 GB   /Users/janavi/Downloads/video/
  ...

  Top 10 Largest Directories
  ─────────────────────────────────────────
   1   node_modules/           3.1 GB   /Users/janavi/Downloads/project/
   2   archive/                2.2 GB   /Users/janavi/Downloads/
   3   video/                  3.4 GB   /Users/janavi/Downloads/
  ...

  Cleanup Candidates
  ─────────────────────────────────────────
  ⚠  4 items identified — 2.16 GB could be freed

  [trash]          ~/.Trash                     1.4 GB
                   Your Trash is not empty. Empty it to reclaim space.

  [stale_download] ~/Downloads/Xcode_14.dmg     7.5 GB
                   Not opened in 62 days.

  [large_cache]    ~/Library/Caches/com.apple…  280 MB
                   Cache directory over 100 MB — regenerated automatically.

  [old_log]        ~/Library/Logs/DiagnosticR…   92 MB
                   Log files older than 30 days.

  ─────────────────────────────────────────
  Run `stacksweep clean` to review and remove candidates.
```

### ASCII bar chart implementation

`format.ts` renders the category bar chart using Unicode block characters (`█`) scaled to a fixed width of 32 columns. The bar length is `Math.round((percentage / 100) * 32)` filled blocks, remainder as `░`.

---

## Edge Cases

| Edge case | Handling |
|---|---|
| `analyze` called before `scan` | Error: "No scan result available. Run `stacksweep scan <path>` first." Exit code 1. |
| Scan had 0 files | Valid analysis result — all counts zero, no candidates |
| `--top 0` | Clamp to 1; print warning |
| `--top` value larger than file count | Show all files — no error |
| Trash path doesn't exist | Skip `trashRule` silently |
| Candidate path deleted between scan and analyze | Report it anyway — Phase 5 will verify existence before deletion |
| `--json` output | Serialize full `AnalysisResult` as JSON, no formatting |

---

## Unit Tests

- `breakdown.ts`: given a mock `ScanResult`, assert `StorageBreakdown` categories are sorted, percentages sum to 100%, `sizeBytes` values correct
- `candidates.ts` — `trashRule`: entries under `~/.Trash` → candidate with `reason: 'trash'`
- `candidates.ts` — `staleDownloadsRule`: file in `~/Downloads` with `modifiedAt` 45 days ago → candidate; file modified yesterday → not a candidate
- `candidates.ts` — `largeCacheRule`: cache dir at 200 MB → candidate; cache dir at 50 MB → not a candidate
- `candidates.ts` — `oldLogsRule`: `.log` file older than 30 days → candidate
- `candidates.ts` — deduplication: same path matched by two rules → appears once
- `format.ts` — `renderBar`: percentage 44% with width 32 → `Math.round(0.44 * 32)` = 14 filled blocks, 18 empty
- `analyzeResult()` integration: full `ScanResult` fixture → `AnalysisResult` with correct `topFiles` count, sorted descending

---

## Deliverables for Phase 3

- [ ] `packages/types/src/analyzer.ts` — `AnalysisResult`, `StorageBreakdown`, `CategoryBreakdown`, `CleanupCandidate` types defined and exported
- [ ] `packages/core/src/analyzer/breakdown.ts` — `computeBreakdown()` implemented
- [ ] `packages/core/src/analyzer/rules.ts` — all 5 built-in candidate rules implemented
- [ ] `packages/core/src/analyzer/candidates.ts` — `identifyCandidates()` runs all rules, deduplicates results
- [ ] `packages/core/src/analyzer/format.ts` — ASCII bar chart renderer, report formatter
- [ ] `packages/core/src/analyzer/index.ts` — public `analyzeResult()` API exported
- [ ] `apps/cli/commands/analyze.ts` — full command implementation with `--top` and `--json` flags
- [ ] `apps/cli/commands/scan.ts` — auto-calls `analyzeResult()` after scan, appends candidate summary
- [ ] `analyze` without prior scan prints a clear error and exits with code 1
- [ ] `--json` flag serializes `AnalysisResult` to stdout
- [ ] `--top <n>` respected in both files and directories lists
- [ ] Unit tests for `breakdown`, `candidates`, `format` modules
- [ ] CI passing

---

*Previous: [Phase 2 — Filesystem Scanner](./phase-2-filesystem-scanner.md)*
*Next: [Phase 4 — Developer Storage Detection](./phase-4-developer-storage.md)*

---

### Completion Status Summary & Executable Commands
**Status**: Fully Implemented & Completed.
- Implemented `packages/core/src/analyzer/` (`breakdown.ts`, `rules.ts`, `candidates.ts`, `format.ts`, `index.ts`).
- Integrated 5 heuristic candidate rules (`trashRule`, `staleDownloadsRule`, `largeCacheRule`, `oldLogsRule`, `tempFilesRule`).
- Formatted 32-column ASCII bar charts (`render32ColBarChart`).
- Auto-chained `analyzeResult()` inside `sweep scan` to display analysis highlights.
- Implemented `sweep analyze` standalone command with `--top <n>` and `--json` options.

**Commands User Can Execute Now**:
- `sweep scan [path]`: Scans directory and appends automatic analysis highlights.
- `sweep analyze [--top <n>] [--json]`: Performs deep analysis on the last scan result.
