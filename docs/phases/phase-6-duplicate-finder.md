# Phase 6 — Duplicate File Finder

> **Goal:** Find duplicate files efficiently using a two-pass strategy that avoids hashing every file.
> Report all duplicate groups with total wasted space. Let the user choose which copies to delete through the same permission-first confirmation flow established in Phase 5.

---

## Objectives

- Implement `DuplicateFinder` module in `packages/core/duplicates/`
- Two-pass algorithm: group by size first (cheap), then hash only potential duplicates (accurate)
- Define `DuplicateGroup` and `DuplicateReport` types
- Implement `stacksweep dupes [path]` CLI command
- Display results grouped by duplicate set with paths and wasted space calculation
- Integrate with Phase 5's cleanup engine: offer to delete copies with full confirmation flow
- Support `--min-size <bytes>` flag to skip small files (default: 1 MB)
- Show a progress bar during the hashing pass (slow, I/O bound)

---

## Core Module: `packages/core/duplicates`

```
packages/core/src/
└── duplicates/
    ├── index.ts            # Public API: findDuplicates()
    ├── group-by-size.ts    # Pass 1: group FsEntry[] by sizeBytes
    ├── hash-files.ts       # Pass 2: compute SHA-256 hashes for candidate groups
    ├── report.ts           # Build DuplicateReport from hash groups
    └── format.ts           # Terminal output formatter
```

---

## Data Model

```typescript
// packages/types/src/duplicates.ts

import { FileEntry } from './scanner'

/**
 * A set of files that are exact duplicates of each other.
 * Contains 2 or more FileEntry items — all with identical content.
 */
export interface DuplicateGroup {
  hash: string                  // SHA-256 hex digest (64 chars)
  sizeBytes: number             // Size of one copy
  wastedBytes: number           // sizeBytes * (files.length - 1) — space freed by keeping one
  files: FileEntry[]            // All copies, sorted by modifiedAt ascending (oldest first)
}

/**
 * The complete duplicate scan report.
 */
export interface DuplicateReport {
  scannedPath: string
  generatedAt: Date
  durationMs: number
  filesScanned: number          // Total files considered (after min-size filter)
  filesHashed: number           // Files that required hashing (passed size-group filter)
  duplicateGroupCount: number
  totalWastedBytes: number      // Sum of wastedBytes across all groups
  groups: DuplicateGroup[]      // Sorted by wastedBytes descending
}

/**
 * Options for findDuplicates().
 */
export interface FindDuplicatesOptions {
  minSizeBytes?: number         // Default: 1_048_576 (1 MB)
  onProgress?: (hashed: number, total: number, currentPath: string) => void
}
```

---

## Two-Pass Algorithm

### Why two passes?

Hashing every file is expensive — a SHA-256 of a 4 GB video file takes seconds. Most files on a system are unique. The first pass filters down to only the files worth hashing, using size as a cheap proxy.

**Guarantee:** Two files with different sizes cannot be duplicates. This is always true, costs nothing (we already have `sizeBytes` from the scanner), and eliminates the majority of files before any I/O.

---

### Pass 1 — Group by size (`group-by-size.ts`)

```typescript
export function groupBySize(
  entries: FileEntry[],
  minSizeBytes: number,
): Map<number, FileEntry[]>
```

**Steps:**
1. Filter out all entries where `sizeBytes < minSizeBytes` — skip tiny files entirely
2. Filter out entries where `sizeBytes === 0` — empty files are always excluded
3. Build a `Map<number, FileEntry[]>` keyed by `sizeBytes`
4. Return only entries where `map.get(size).length >= 2` — sizes with only one file are unique by definition

**Result:** A map containing only file groups where at least 2 files share the same size. These are the candidates for hashing.

```
Input:  1,284 files
After min-size filter:  890 files (skipped 394 files < 1 MB)
After size-uniqueness filter:  143 files in 61 size groups
→ Pass 1 eliminated 1,141 files without touching disk
```

---

### Pass 2 — Hash by content (`hash-files.ts`)

```typescript
export async function hashFiles(
  sizeGroups: Map<number, FileEntry[]>,
  onProgress?: (hashed: number, total: number, currentPath: string) => void,
): Promise<Map<string, FileEntry[]>>
```

**Steps:**
1. Flatten `sizeGroups` values into a list of files to hash
2. For each file, compute SHA-256 using Node's built-in `crypto.createHash('sha256')`
3. Stream the file contents through the hasher — do **not** read the whole file into memory at once
4. Call `onProgress` after each file completes
5. Build a `Map<string, FileEntry[]>` keyed by hash digest
6. Return only entries where `map.get(hash).length >= 2` — unique hashes are not duplicates

**Streaming hash implementation:**

```typescript
import { createReadStream } from 'fs'
import { createHash } from 'crypto'

async function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
```

---

### Report assembly (`report.ts`)

```typescript
export function buildReport(
  scannedPath: string,
  hashGroups: Map<string, FileEntry[]>,
  metadata: { filesScanned: number; filesHashed: number; durationMs: number },
): DuplicateReport
```

**For each hash group:**
- Sort `files` by `modifiedAt` ascending — oldest file first (presumed original)
- Compute `wastedBytes = sizeBytes * (files.length - 1)`

**Sort groups** by `wastedBytes` descending — the most wasteful duplicates appear first.

---

## Which Copy to Keep

**Default behaviour:** Keep the oldest copy (`files[0]` after sorting by `modifiedAt` ascending). The rationale is that the oldest copy is most likely the original. This is clearly stated in the output.

**User override:** The confirmation prompt for duplicate cleanup shows all copies with their paths and modification dates and lets the user select which to keep before confirming deletion of the rest.

```
  Duplicate Group  (2 copies · 4.2 GB each · 4.2 GB wasted)
  Hash: a3f9d2c1...

   [KEEP]  /Users/janavi/Documents/footage-raw.mov          modified 2024-01-15
   [DEL?]  /Users/janavi/Downloads/footage-raw.mov          modified 2024-03-22

  ? Keep which copy?
  ❯ Oldest (2024-01-15) — /Users/janavi/Documents/footage-raw.mov
    Newest (2024-03-22) — /Users/janavi/Downloads/footage-raw.mov
    Skip this group
```

After the user selects which to keep, the remaining copies are passed to Phase 5's confirmation flow (one prompt per file to delete, with the full `[y] Yes  [n] No  [a] Yes to all  [q] Quit` loop).

---

## CLI Command: `dupes`

```bash
stacksweep dupes [path] [options]

Arguments:
  path              Directory to scan for duplicates (default: current directory)

Options:
  --min-size <n>    Only consider files at least N bytes in size (default: 1048576)
  --json            Output raw DuplicateReport as JSON
  -h, --help        Display help for command
```

---

## Progress Display

Hashing is I/O bound and can take minutes on large directories. A progress bar is mandatory:

```
  ⠙ Hashing files... [████████████░░░░░░░░░░░░░░░░░░] 87/143  footage-raw.mov
```

Use `cli-progress` or build a simple progress bar using `process.stdout.write`. Update after each file completes. Show:
- Filled/empty bar (fixed 32-char width)
- `<hashed>/<total>` file count
- Basename of the file currently being hashed

When hashing completes, replace the progress bar line with a single summary:

```
  ✔ Hashed 143 files in 8.4s
```

---

## Terminal Output: Duplicate Report

```
  StackSweep — Duplicate Files
  ─────────────────────────────────────────
  Path:      /Users/janavi
  Scanned:   890 files (above 1 MB)
  Hashed:    143 files
  Duration:  8.4s

  Found 4 duplicate groups — 7.8 GB wasted

  ─── Group 1 of 4 ─────────────────────────
  4.2 GB × 2 copies  (4.2 GB wasted)
  Hash: a3f9d2c1...

    ORIGINAL   /Users/janavi/Documents/footage-raw.mov      2024-01-15
    DUPLICATE  /Users/janavi/Downloads/footage-raw.mov      2024-03-22

  ─── Group 2 of 4 ─────────────────────────
  1.8 GB × 2 copies  (1.8 GB wasted)
  Hash: b8e21a3f...

    ORIGINAL   /Users/janavi/Backup/project-backup.zip      2023-11-01
    DUPLICATE  /Users/janavi/Downloads/project-backup.zip   2024-02-14

  ─── Group 3 of 4 ─────────────────────────
  ...

  ─────────────────────────────────────────
  Total wasted space: 7.8 GB across 4 groups

  Run `stacksweep dupes --clean` to remove duplicate copies interactively.
```

---

## Edge Cases

| Edge case | Handling |
|---|---|
| File disappears between size-group pass and hash pass | Catch ENOENT in `sha256()` — skip the file, reduce `total` in progress, log a warning |
| Permission error during hash read | Catch EACCES — skip the file, log warning: "Could not read: <path>" |
| Two files with identical size but different content | Pass 1 groups them; Pass 2 hashes them — they get different hashes → not marked as duplicates. Correct. |
| File is exactly 0 bytes | Excluded in Pass 1 before any grouping |
| All files are below `--min-size` | `filesScanned: 0`, `duplicateGroupCount: 0` — print info and exit 0 |
| `--min-size 0` | Accept it — 0-byte files are still filtered out |
| Single file in a size group (after another disappears during hashing) | Hash group has only 1 entry → not a duplicate → excluded from report |
| Symlinks | Respect the Phase 2 rule: symlinks are never followed. Symlink targets are not hashed. |
| Very large file (multi-GB) | Streaming hash handles this — no memory spike |

---

## Performance Note

Hashing is I/O bound, not CPU bound. Reading a large file from disk is the bottleneck.

**Phase 9 will parallelise this** using `worker_threads` or a bounded concurrency pool. In Phase 6, hashing is sequential (one file at a time) for correctness and simplicity. The progress bar makes the wait acceptable for typical home directories.

Do not prematurely optimise in Phase 6. Mark the hash loop with a `// TODO(phase-9): parallelise` comment.

---

## Unit Tests

All tests use fixture-based mock filesystems — a fixed set of `FileEntry` objects with known sizes, paths, and modification dates. No real disk access in unit tests.

- `group-by-size.ts` — 3 files with unique sizes → empty map (no candidates)
- `group-by-size.ts` — 2 files sharing size, 1 unique → map with 1 group of 2 files
- `group-by-size.ts` — files below `minSizeBytes` → filtered out before grouping
- `group-by-size.ts` — 0-byte files → always excluded regardless of `minSizeBytes`
- `hash-files.ts` — mock `sha256()`: 2 files with same mocked hash → one group returned
- `hash-files.ts` — mock `sha256()`: 2 files with different hashes → no groups returned
- `hash-files.ts` — file disappears (ENOENT) during hashing → skipped, no crash, warning logged
- `hash-files.ts` — `onProgress` callback: assert called once per successfully hashed file
- `report.ts` — `buildReport()`: given hash groups fixture, assert `wastedBytes` correct for each group
- `report.ts` — assert groups sorted by `wastedBytes` descending
- `report.ts` — assert `files` within each group sorted by `modifiedAt` ascending (oldest first)
- `format.ts` — `formatReport()`: given a `DuplicateReport` fixture, assert output contains group count, total wasted bytes, and paths

---

## Deliverables for Phase 6

- [ ] `packages/types/src/duplicates.ts` — `DuplicateGroup`, `DuplicateReport`, `FindDuplicatesOptions` types defined and exported
- [ ] `packages/core/src/duplicates/group-by-size.ts` — `groupBySize()` with min-size and zero-byte filtering
- [ ] `packages/core/src/duplicates/hash-files.ts` — streaming SHA-256 via `crypto`, `onProgress` callback, ENOENT/EACCES handling
- [ ] `packages/core/src/duplicates/report.ts` — `buildReport()` with correct sorting and `wastedBytes` calculation
- [ ] `packages/core/src/duplicates/format.ts` — duplicate group terminal formatter
- [ ] `packages/core/src/duplicates/index.ts` — public `findDuplicates()` API
- [ ] `apps/cli/commands/dupes.ts` — full command with `--min-size` and `--json` flags
- [ ] Progress bar shown during hashing pass — updates per file
- [ ] Progress bar replaced with summary line on completion
- [ ] Integration with Phase 5 cleanup: `stacksweep dupes --clean` passes confirmed duplicates to `runCleanup()`
- [ ] Which-copy-to-keep prompt shown before cleanup confirmation loop
- [ ] `--json` flag outputs raw `DuplicateReport`
- [ ] `// TODO(phase-9): parallelise` comment in hash loop
- [ ] Unit tests for all four modules (group-by-size, hash-files, report, format)
- [ ] CI passing

---

*Previous: [Phase 5 — Safe Cleanup Engine](./phase-5-safe-cleanup.md)*
*Next: Phase 7 — Persistence & History (coming soon)*
