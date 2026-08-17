# Sweep CLI Commands Reference

> This reference lists all CLI commands, flags, subcommands, and options currently available in **Sweep**. Update this document whenever a new command or flag is introduced.

---

## Overview

| Command | Description | Phase |
|---------|-------------|-------|
| [`sweep scan`](#1-sweep-scan-path) | Scan a directory and report storage usage | Phase 2 |
| [`sweep analyze`](#2-sweep-analyze-path) | Detailed storage breakdown & candidate highlights | Phase 3 |
| [`sweep dev`](#3-sweep-dev) | Detect storage used by developer tools and package managers | Phase 4 |
| [`sweep clean`](#4-sweep-clean) | Safely clean identified storage candidates (permission-first) | Phase 5 |
| [`sweep dupes`](#5-sweep-dupes-path) | Find duplicate files using two-pass size + SHA-256 hashing | Phase 6 |
| [`sweep history`](#6-sweep-history) | View past scans and cleanup audit log from SQLite | Phase 7 |
| [`sweep config`](#7-sweep-config) | Read and write configuration in `~/.sweep/config.json` | Phase 7 |
| [`sweep cache`](#8-sweep-cache) | View status or clear SQLite scan cache | Phase 8 |
| [`sweep --version`](#9-sweep---version---v) | Display current CLI version | Phase 1 |
| [`sweep --help`](#10-sweep---help---h) | Display CLI help menu | Phase 1 |

---

## Command Details

### 1. `sweep scan [path]`
Scans a target directory recursively to compute total disk usage, file/directory counts, category breakdown, and largest files. Automatically records scan metadata into the SQLite database.

```bash
sweep scan                    # Scan current directory
sweep scan ~/Projects         # Scan specific directory
sweep scan --depth 3          # Limit recursion depth to 3 levels
sweep scan --no-cache         # Bypass cached directory scan results
sweep scan --json             # Output raw ScanResult as JSON
```

- **Arguments**: `[path]` (default: `.`)
- **Flags**:
  - `--depth <n>`: Maximum directory recursion depth.
  - `--no-cache`: Force fresh scan without using cached results.
  - `--json`: Output raw structured JSON.

---

### 2. `sweep analyze [path]`
Analyzes a directory (or last scan result) to provide category statistics, top N largest files & directories, and actionable cleanup recommendations.

```bash
sweep analyze                 # Analyze current directory
sweep analyze ~/Downloads     # Analyze specific path
sweep analyze --top 20        # Show top 20 largest files and directories
sweep analyze --json          # Output analysis report as JSON
```

- **Arguments**: `[path]` (default: `.`)
- **Flags**:
  - `--top <n>`: Number of top files/directories to list (default: 10).
  - `--json`: Output raw `AnalysisResult` as JSON.

---

### 3. `sweep dev`
Detects disk space consumed by installed developer tools, caches, build artifacts, and package managers across standard macOS locations.

```bash
sweep dev                     # Scan and display developer storage by tool
sweep dev --json              # Output developer storage report as JSON
```

- **Detected Tools**:
  - **Xcode**: DerivedData, Archives, iOS DeviceSupport, Simulator Caches
  - **Docker**: Container disk images (`~/Library/Containers/com.docker.docker`)
  - **Package Managers**: `~/.npm`, `~/Library/pnpm/store`, `~/.yarn/cache`, `~/.gradle/caches`, `~/.cargo/registry`, `~/.m2/repository`, `~/Library/Caches/pip`, `~/.pub-cache`
- **Flags**:
  - `--json`: Output raw `DevStorageReport` as JSON.

---

### 4. `sweep clean`
Identifies safe cleanup candidates (caches, Xcode derived data, stale logs, temporary files) and interactively prompts for deletion confirmation. **Permission-first model: never deletes anything without user confirmation.**

```bash
sweep clean                   # Start interactive cleanup session
sweep clean --dry-run         # Show what would be deleted without taking action
sweep clean --dev             # Clean developer storage candidates only
sweep clean --limit 20        # List up to 20 candidate lines in dry-run mode
sweep clean --json            # Output CleanupSessionResult as JSON
```

- **Flags**:
  - `--dry-run`: Read-only preview showing total candidates and freeable space.
  - `--dev`: Restrict candidates to developer tool caches/artifacts only.
  - `--limit <n>`: Maximum candidates to display in dry-run output (default: 10).
  - `--json`: Output raw `CleanupSessionResult` as JSON.

---

### 5. `sweep dupes [path]`
Finds duplicate files in a directory using a two-pass algorithm:
1. **Pass 1**: Group files by exact byte size (skips unique file sizes instantly).
2. **Pass 2**: Stream SHA-256 content hashes for files with matching sizes.

```bash
sweep dupes                   # Find duplicates in current directory
sweep dupes ~/Documents       # Find duplicates in specific directory
sweep dupes --min-size 5000000 # Only consider files larger than 5 MB
sweep dupes --json            # Output raw DuplicateReport as JSON
```

- **Arguments**: `[path]` (default: `.`)
- **Flags**:
  - `--min-size <bytes>`: Minimum file size in bytes to check (default: `1048576` / 1MB).
  - `--json`: Output raw `DuplicateReport` as JSON.

---

### 6. `sweep history`
Queries the SQLite database (`~/.sweep/sweep.db`) to show past scan runs and cleanup audit logs.

```bash
sweep history                 # Show scan history and cleanup audit log
sweep history --scans         # Show scan history only
sweep history --cleanups      # Show cleanup audit log only
sweep history --limit 5       # Limit output to 5 entries
sweep history --json          # Output history as raw JSON
```

- **Flags**:
  - `--scans`: Display scan history only.
  - `--cleanups`: Display cleanup audit log only.
  - `--limit <n>`: Maximum records to list (default: 10).
  - `--json`: Output raw database records as JSON.

---

### 7. `sweep config`
Manages user configuration settings stored in `~/.sweep/config.json`. The configuration file is human-readable JSON.

```bash
sweep config get defaultScanDepth       # Read a setting from config.json
sweep config set defaultScanDepth 15    # Set a setting value in config.json
sweep config set logLevel verbose       # Set log level
```

- **Subcommands**:
  - `get <key>`: Prints value of `<key>`.
  - `set <key> <value>`: Updates `<key>` to `<value>`.

---

### 8. `sweep cache`
Manages the two-layer (Memory + SQLite) scan cache used for incremental scanning.

```bash
sweep cache status            # Show cache entry count, total size on disk, and oldest entry
sweep cache clear             # Clear all cached directory scan entries
```

- **Subcommands**:
  - `status`: Displays entry count and size on disk.
  - `clear`: Empties memory and persistent SQLite cache entries.

---

### 9. `sweep --version` / `sweep -v`
Prints the current version of the Sweep CLI.

```bash
sweep --version
sweep -v
```

---

### 10. `sweep --help` / `sweep -h`
Prints the CLI help summary listing commands and options.

```bash
sweep --help
sweep -h
```
