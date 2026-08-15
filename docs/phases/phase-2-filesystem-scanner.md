# Phase 2 — Filesystem Scanner

> **Goal:** Build the core filesystem scanning engine inside `packages/core`.
> The CLI's `scan` command becomes fully functional — it traverses directories, collects file metadata, categorises files, and prints a structured report.
> Everything is **read-only** in this phase.

---

## Objectives

- Implement recursive directory traversal in `packages/core/scanner`
- Collect accurate file metadata: size, modified time, type, extension
- Categorise files into meaningful groups (Videos, Images, Archives, etc.)
- Handle edge cases: symlinks, permission errors, hidden files, special files
- Wire the scanner into the `scan` CLI command
- Print a clear, formatted terminal report

---

## Core Module: `packages/core/scanner`

```
packages/core/src/
└── scanner/
    ├── index.ts          # Public API: scanDirectory()
    ├── traverse.ts       # Recursive directory walker
    ├── metadata.ts       # File stat collection
    ├── categorise.ts     # File → category mapping
    └── types.ts          # Scanner-specific types (re-exported via packages/types)
```

---

## Data Model

```typescript
// packages/types/src/scanner.ts

export interface FileEntry {
  path: string
  name: string
  extension: string
  sizeBytes: number
  modifiedAt: Date
  isDirectory: false
  category: FileCategory
  isHidden: boolean
  isSymlink: boolean
}

export interface DirectoryEntry {
  path: string
  name: string
  sizeBytes: number        // Sum of all children recursively
  fileCount: number
  isHidden: boolean
  isSymlink: boolean
  isDirectory: true
}

export type FsEntry = FileEntry | DirectoryEntry

export interface ScanResult {
  rootPath: string
  scannedAt: Date
  durationMs: number
  totalSizeBytes: number
  fileCount: number
  directoryCount: number
  skippedCount: number     // permission errors, unreadable files
  categories: CategorySummary[]
  largestFiles: FileEntry[]
  largestDirectories: DirectoryEntry[]
  entries: FsEntry[]
}

export interface CategorySummary {
  category: FileCategory
  sizeBytes: number
  fileCount: number
  percentage: number
}
```

---

## File Categories

```typescript
// packages/types/src/categories.ts

export enum FileCategory {
  Video       = 'Videos',
  Audio       = 'Audio',
  Image       = 'Images',
  Document    = 'Documents',
  Archive     = 'Archives',
  Code        = 'Code',
  Data        = 'Data',
  Executable  = 'Executables',
  Cache       = 'Cache',
  Log         = 'Logs',
  Temporary   = 'Temporary',
  Other       = 'Other',
}
```

### Category → Extension mapping (examples)

| Category | Extensions |
|---|---|
| Video | `.mp4`, `.mov`, `.mkv`, `.avi`, `.m4v` |
| Audio | `.mp3`, `.m4a`, `.flac`, `.wav`, `.aac` |
| Image | `.jpg`, `.jpeg`, `.png`, `.gif`, `.heic`, `.webp`, `.svg` |
| Document | `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.pages`, `.md`, `.txt` |
| Archive | `.zip`, `.tar`, `.gz`, `.rar`, `.7z`, `.dmg`, `.pkg` |
| Code | `.ts`, `.js`, `.py`, `.swift`, `.java`, `.go`, `.rs` |
| Data | `.json`, `.csv`, `.xml`, `.db`, `.sqlite` |
| Executable | `.app` bundles, ELF/Mach-O binaries |
| Cache | Any file inside a `*Cache*` or `*cache*` directory |
| Log | `.log`, files inside `Logs/` directories |
| Temporary | `.tmp`, `.temp`, files inside `tmp/` directories |

---

## Traversal Logic

```
scanDirectory(rootPath)
    │
    ├── Validate path exists and is readable
    │
    ├── Read directory entries (fs.readdir)
    │
    ├── For each entry:
    │   ├── stat() to get size, type, mtime
    │   ├── Check if symlink → record but do NOT follow
    │   ├── Check if readable → if not, record as skipped
    │   ├── If file → categorise → add to entries
    │   └── If directory → recurse
    │
    └── Aggregate totals → return ScanResult
```

### Symlink handling
- Symlinks are recorded with `isSymlink: true`
- Symlinks are **never followed** — infinite loop prevention
- Symlink size is recorded as the size of the link itself, not the target

### Permission errors
- Caught individually per file/directory
- Recorded in `skippedCount`
- Scan continues — one unreadable file does not abort the whole scan

### Hidden files
- Files/dirs starting with `.` are marked `isHidden: true`
- Included in results by default
- A `--no-hidden` flag can filter them in a later phase

---

## CLI Command: `scan`

```bash
stacksweep scan [path] [options]

Arguments:
  path          Directory to scan (default: current directory)

Options:
  --depth <n>   Maximum directory depth (default: unlimited)
  --json        Output raw JSON instead of formatted report
  -h, --help    Display help for command
```

### Terminal output

```
  StackSweep Scan
  ─────────────────────────────────────────
  Path:        /Users/janavi/Downloads
  Scanned:     1,284 files in 87 directories
  Total size:  18.42 GB
  Duration:    1.2s

  Storage by Category
  ─────────────────────────────────────────
  Videos        8.2 GB   ████████████░░░░  44%
  Archives      4.1 GB   ██████░░░░░░░░░░  22%
  Documents     2.7 GB   ████░░░░░░░░░░░░  14%
  Images        1.8 GB   ███░░░░░░░░░░░░░  10%
  Other         1.6 GB   ██░░░░░░░░░░░░░░   9%

  Largest Files
  ─────────────────────────────────────────
  movie.mkv            4.2 GB   /Users/janavi/Downloads/
  project-backup.zip   1.8 GB   /Users/janavi/Downloads/
  ...

  Largest Directories
  ─────────────────────────────────────────
  node_modules/        3.1 GB   /Users/janavi/Downloads/project/
  ...

  ─────────────────────────────────────────
  Skipped 3 items (permission denied)
  Run `stacksweep analyze` for a deeper breakdown.
```

---

## Progress Display

For large directories, scanning takes time. Show a spinner:

```
  ⠙ Scanning... /Users/janavi/Library/Developer (12,841 files so far)
```

Use `ora` for the spinner. Update the path shown every 500ms.

---

## Edge Cases to Handle

| Edge case | Handling |
|---|---|
| Non-existent path | Print clear error, exit code 1 |
| File passed instead of directory | Error: "Expected a directory, got a file" |
| No read permission on root | Error immediately, don't start scan |
| Empty directory | Valid result: 0 files, 0 bytes |
| Circular symlinks | Never follow symlinks → no issue |
| Network-mounted volumes | Scan proceeds; may be slow — no special handling yet |
| Root filesystem `/` | Allowed but warn the user it may take a very long time |

---

## Unit Tests

- `traverse.ts`: mock filesystem, assert correct file tree
- `metadata.ts`: assert correct size, date, symlink detection
- `categorise.ts`: assert each extension maps to correct category
- Scanner integration: scan a fixture directory, assert `ScanResult` shape
- Edge cases: empty dir, permission-denied dir, symlinks

---

## Deliverables for Phase 2

- [ ] `packages/types` — `FileEntry`, `DirectoryEntry`, `ScanResult`, `FileCategory` types defined
- [ ] `packages/core/scanner/traverse.ts` — recursive traversal with symlink + error handling
- [ ] `packages/core/scanner/metadata.ts` — file stat collection
- [ ] `packages/core/scanner/categorise.ts` — extension → category mapping
- [ ] `packages/core/scanner/index.ts` — public `scanDirectory()` API
- [ ] `apps/cli/commands/scan.ts` — wired to scanner, displays formatted report
- [ ] Progress spinner shown during scan
- [ ] `--json` flag outputs raw JSON
- [ ] All edge cases handled cleanly
- [ ] Unit tests covering traversal, metadata, and categorisation
- [ ] CI passing

---

*Previous: [Phase 1 — CLI Foundation](./phase-1-cli-foundation.md)*
*Next: [Phase 3 — Storage Analyzer & Reporting](./phase-3-storage-analyzer.md)*
