# Phase 7 — SQLite Persistence

> **Goal:** Replace the plain-text cleanup log introduced in Phase 5 with a proper SQLite-backed persistence layer. Store scan history, cleanup history, and user settings in a structured, queryable database. Config remains a human-editable JSON file.

---

## Objectives

- Introduce `packages/database/` as a dedicated workspace package
- Design and implement the full database schema with a version-controlled migration system
- Replace the Phase 5 flat-file cleanup log with database writes
- Expose scan and cleanup history via new `stacksweep history` CLI commands
- Maintain `~/.stacksweep/config.json` as a plain JSON file — readable and editable by the user without tooling
- Achieve 100% unit test coverage for all `DatabaseService` methods

---

## Package: `packages/database/`

### Directory Structure

```
packages/database/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Public API re-exports
│   ├── database.ts              # DatabaseService class
│   ├── migrations/
│   │   ├── index.ts             # Migration runner
│   │   ├── 001_initial.sql      # Base schema
│   │   └── 002_settings.sql     # Settings table (if phased separately)
│   └── types.ts                 # TypeScript interfaces for all rows
└── tests/
    └── database.test.ts
```

### `package.json`

```json
{
  "name": "@stacksweep/database",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8"
  }
}
```

> **Why `better-sqlite3`?** It is synchronous by design, which is ideal for CLI tools. No `await` chains for every query, no risk of out-of-order writes during a scan, and excellent performance for the workload sizes StackSweep encounters.

---

## Database Location

```
~/.stacksweep/
├── stacksweep.db     ← SQLite database (this phase)
└── config.json       ← User config (JSON, stays as-is)
```

The `DatabaseService` must create `~/.stacksweep/` if it does not exist. Use `fs.mkdirSync(dir, { recursive: true })` before calling `new Database(path)`.

```typescript
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(os.homedir(), '.stacksweep');
const DB_PATH = path.join(DB_DIR, 'stacksweep.db');

fs.mkdirSync(DB_DIR, { recursive: true });
const db = new Database(DB_PATH);
```

---

## Schema Design

### Migration 001 — Initial Schema

```sql
-- 001_initial.sql

-- Tracks each invocation of `stacksweep scan`
CREATE TABLE IF NOT EXISTS scans (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  root_path        TEXT    NOT NULL,
  scanned_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  duration_ms      INTEGER NOT NULL,
  total_size_bytes INTEGER NOT NULL,
  file_count       INTEGER NOT NULL,
  directory_count  INTEGER NOT NULL,
  skipped_count    INTEGER NOT NULL
);

-- Individual filesystem entries discovered during a scan
CREATE TABLE IF NOT EXISTS scan_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id      INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  path         TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  size_bytes   INTEGER NOT NULL,
  category     TEXT    NOT NULL,   -- e.g. 'node_modules', 'cache', 'log', 'other'
  is_directory INTEGER NOT NULL,   -- 0 or 1 (SQLite has no BOOLEAN)
  is_hidden    INTEGER NOT NULL    -- 0 or 1
);

-- Audit log for every file/directory the user confirmed for deletion
CREATE TABLE IF NOT EXISTS cleanup_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cleaned_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  path         TEXT    NOT NULL,
  size_bytes   INTEGER NOT NULL,
  rule_id      TEXT    NOT NULL,   -- which cleanup rule triggered this
  confirmed_at TEXT    NOT NULL    -- when the user explicitly confirmed
);

-- Key-value store for persistent app state (NOT user-editable config)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Migration version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

### Indexes

```sql
-- Speeds up history queries filtered by root_path or date
CREATE INDEX IF NOT EXISTS idx_scans_root_path   ON scans(root_path);
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at  ON scans(scanned_at DESC);

-- Speeds up per-scan entry lookups and category filters
CREATE INDEX IF NOT EXISTS idx_scan_entries_scan_id  ON scan_entries(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_entries_category ON scan_entries(category);

-- Speeds up cleanup history queries
CREATE INDEX IF NOT EXISTS idx_cleanup_events_cleaned_at ON cleanup_events(cleaned_at DESC);
```

---

## TypeScript Types

```typescript
// src/types.ts

export interface ScanRow {
  id: number;
  root_path: string;
  scanned_at: string;        // ISO 8601 UTC string
  duration_ms: number;
  total_size_bytes: number;
  file_count: number;
  directory_count: number;
  skipped_count: number;
}

export interface ScanEntryRow {
  id: number;
  scan_id: number;
  path: string;
  name: string;
  size_bytes: number;
  category: EntryCategory;
  is_directory: 0 | 1;
  is_hidden: 0 | 1;
}

export type EntryCategory =
  | 'node_modules'
  | 'cache'
  | 'log'
  | 'build_artifact'
  | 'xcode_derived'
  | 'docker'
  | 'duplicate'
  | 'other';

export interface CleanupEventRow {
  id: number;
  cleaned_at: string;
  path: string;
  size_bytes: number;
  rule_id: string;
  confirmed_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

// Input types (no id, no auto-timestamps)
export type NewScan = Omit<ScanRow, 'id' | 'scanned_at'>;
export type NewScanEntry = Omit<ScanEntryRow, 'id'>;
export type NewCleanupEvent = Omit<CleanupEventRow, 'id' | 'cleaned_at'>;
```

---

## Migration System

Migrations run automatically on every startup. The runner reads `schema_migrations` to determine which migrations have already been applied, then executes any pending ones in order.

```typescript
// src/migrations/index.ts

import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '.');

interface MigrationFile {
  version: number;
  filename: string;
  sql: string;
}

export function runMigrations(db: Database.Database): void {
  // Ensure the migrations table exists (bootstrapping problem)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
      .map(r => r.version)
  );

  const migrations = loadMigrationFiles().filter(m => !applied.has(m.version));

  if (migrations.length === 0) return;

  // Run all pending migrations in a single transaction for atomicity
  const applyAll = db.transaction(() => {
    for (const migration of migrations) {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
    }
  });

  applyAll();
}

function loadMigrationFiles(): MigrationFile[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}_.*\.sql$/.test(f))
    .sort()
    .map(filename => {
      const version = parseInt(filename.slice(0, 3), 10);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
      return { version, filename, sql };
    });
}
```

> [!IMPORTANT]
> Never modify a migration file after it has been applied to any environment. Always add a new numbered migration file instead. This is the core invariant of the migration system.

---

## `DatabaseService` Class

```typescript
// src/database.ts

import Database from 'better-sqlite3';
import { runMigrations } from './migrations/index.js';
import type {
  ScanRow,
  ScanEntryRow,
  CleanupEventRow,
  SettingRow,
  NewScan,
  NewScanEntry,
  NewCleanupEvent,
} from './types.js';

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // WAL mode: better concurrent read performance, no blocking on writes
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
  }

  // ─── Scans ──────────────────────────────────────────────────────────────────

  insertScan(scan: NewScan): number {
    const stmt = this.db.prepare(`
      INSERT INTO scans (root_path, duration_ms, total_size_bytes, file_count, directory_count, skipped_count)
      VALUES (@root_path, @duration_ms, @total_size_bytes, @file_count, @directory_count, @skipped_count)
    `);
    const result = stmt.run(scan);
    return result.lastInsertRowid as number;
  }

  getRecentScans(limit = 10): ScanRow[] {
    return this.db
      .prepare('SELECT * FROM scans ORDER BY scanned_at DESC LIMIT ?')
      .all(limit) as ScanRow[];
  }

  getScanById(id: number): ScanRow | undefined {
    return this.db
      .prepare('SELECT * FROM scans WHERE id = ?')
      .get(id) as ScanRow | undefined;
  }

  // ─── Scan Entries ────────────────────────────────────────────────────────────

  insertScanEntries(entries: NewScanEntry[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO scan_entries (scan_id, path, name, size_bytes, category, is_directory, is_hidden)
      VALUES (@scan_id, @path, @name, @size_bytes, @category, @is_directory, @is_hidden)
    `);
    // Wrap in transaction for performance — individual inserts for 10k rows are slow
    const insertAll = this.db.transaction((rows: NewScanEntry[]) => {
      for (const row of rows) stmt.run(row);
    });
    insertAll(entries);
  }

  getEntriesByScanId(scanId: number): ScanEntryRow[] {
    return this.db
      .prepare('SELECT * FROM scan_entries WHERE scan_id = ?')
      .all(scanId) as ScanEntryRow[];
  }

  getEntriesByCategory(scanId: number, category: string): ScanEntryRow[] {
    return this.db
      .prepare('SELECT * FROM scan_entries WHERE scan_id = ? AND category = ?')
      .all(scanId, category) as ScanEntryRow[];
  }

  // ─── Cleanup Events ──────────────────────────────────────────────────────────

  insertCleanupEvent(event: NewCleanupEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO cleanup_events (path, size_bytes, rule_id, confirmed_at)
      VALUES (@path, @size_bytes, @rule_id, @confirmed_at)
    `);
    const result = stmt.run(event);
    return result.lastInsertRowid as number;
  }

  insertCleanupEvents(events: NewCleanupEvent[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO cleanup_events (path, size_bytes, rule_id, confirmed_at)
      VALUES (@path, @size_bytes, @rule_id, @confirmed_at)
    `);
    const insertAll = this.db.transaction((rows: NewCleanupEvent[]) => {
      for (const row of rows) stmt.run(row);
    });
    insertAll(events);
  }

  getRecentCleanupEvents(limit = 20): CleanupEventRow[] {
    return this.db
      .prepare('SELECT * FROM cleanup_events ORDER BY cleaned_at DESC LIMIT ?')
      .all(limit) as CleanupEventRow[];
  }

  getTotalByteCleaned(): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM cleanup_events')
      .get() as { total: number };
    return row.total;
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  getSetting(key: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as Pick<SettingRow, 'value'> | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value);
  }

  getAllSettings(): SettingRow[] {
    return this.db.prepare('SELECT * FROM settings ORDER BY key').all() as SettingRow[];
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
```

---

## Config File: Still JSON

`~/.stacksweep/config.json` is **not** stored in SQLite. The design rationale:

- Users should be able to open and edit config in any text editor without installing anything
- A database is opaque without `sqlite3` CLI or similar tooling
- JSON config is the convention users expect from developer tools

The `settings` table is for **internal app state** (e.g., `last_scan_id`, `install_date`) — not user-facing configuration.

```typescript
// packages/config/src/config.ts (existing, unchanged from Phase 4)
export interface StackSweepConfig {
  defaultScanDepth: number;
  excludePaths: string[];
  cleanupRules: CleanupRule[];
  logLevel: 'silent' | 'normal' | 'verbose';
}
```

---

## CLI Commands

### `stacksweep history`

Shows the last N scans and cleanup events interleaved by date.

```
$ stacksweep history

  Scan History (last 5)
  ─────────────────────────────────────────────────────────────
  #12  ~/Projects   2026-08-14 21:03   4.2s   82,341 files   12.4 GB
  #11  ~/Projects   2026-08-13 09:17   3.9s   81,900 files   12.1 GB
  #10  ~/Downloads  2026-08-12 14:55   0.8s    4,210 files    3.2 GB

  Cleanup History (last 5)
  ─────────────────────────────────────────────────────────────
  2026-08-14 21:05   node_modules   ~/Projects/old-app/node_modules   1.2 GB
  2026-08-14 21:05   cache          ~/Library/Caches/com.docker        840 MB
  2026-08-13 10:00   log            ~/Projects/api/logs/               220 MB

  Total cleaned: 2.26 GB across 3 events
```

### `stacksweep history --scans`

Scan history only. Supports `--limit N` (default 10).

### `stacksweep history --cleanups`

Cleanup history only. Supports `--limit N` (default 20).

### `stacksweep config get <key>`

Reads from `~/.stacksweep/config.json`.

```
$ stacksweep config get defaultScanDepth
10
```

### `stacksweep config set <key> <value>`

Writes to `~/.stacksweep/config.json`. Validates the key exists in the schema before writing.

```
$ stacksweep config set defaultScanDepth 15
✔ config.json updated: defaultScanDepth = 15
```

> [!WARNING]
> `stacksweep config set` must validate the key and value type before writing. Writing an invalid value to config.json will break subsequent scans. Use Zod or a simple type guard.

---

## Replacing the Phase 5 Plain-Text Log

Phase 5 wrote cleanup confirmations to `~/.stacksweep/cleanup.log` as newline-delimited text. This is removed in Phase 7.

**Migration path:**
1. On first run after Phase 7 upgrade, check if `cleanup.log` exists
2. If yes, parse each line and insert into `cleanup_events` with a best-effort `confirmed_at` derived from the log timestamp
3. Rename `cleanup.log` to `cleanup.log.migrated` (do not delete — user may want to inspect)
4. Log a one-time notice: `"Migrated cleanup.log to database. Run 'stacksweep history --cleanups' to verify."`

```typescript
// src/migrations/migrate-legacy-log.ts
export function migrateLegacyLog(db: DatabaseService, logPath: string): void {
  if (!fs.existsSync(logPath)) return;
  if (db.getSetting('legacy_log_migrated') === 'true') return;

  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
  // parse lines → NewCleanupEvent[]
  // db.insertCleanupEvents(events);
  db.setSetting('legacy_log_migrated', 'true');
  fs.renameSync(logPath, logPath + '.migrated');
}
```

---

## Unit Tests

File: `packages/database/tests/database.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../src/database.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

describe('DatabaseService', () => {
  let db: DatabaseService;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    db = new DatabaseService(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.unlinkSync(dbPath);
  });

  // ─── scans ─────────────────────────────────────────────────────────────────

  it('insertScan returns a positive integer id', () => {
    const id = db.insertScan({
      root_path: '/home/test',
      duration_ms: 1200,
      total_size_bytes: 5_000_000,
      file_count: 500,
      directory_count: 40,
      skipped_count: 2,
    });
    expect(id).toBeGreaterThan(0);
  });

  it('getRecentScans returns scans in descending order', () => {
    db.insertScan({ root_path: '/a', duration_ms: 100, total_size_bytes: 0, file_count: 0, directory_count: 0, skipped_count: 0 });
    db.insertScan({ root_path: '/b', duration_ms: 200, total_size_bytes: 0, file_count: 0, directory_count: 0, skipped_count: 0 });
    const scans = db.getRecentScans();
    expect(scans[0].root_path).toBe('/b');
  });

  it('getRecentScans respects limit', () => {
    for (let i = 0; i < 15; i++) {
      db.insertScan({ root_path: `/p${i}`, duration_ms: 100, total_size_bytes: 0, file_count: 0, directory_count: 0, skipped_count: 0 });
    }
    expect(db.getRecentScans(5)).toHaveLength(5);
  });

  // ─── scan_entries ──────────────────────────────────────────────────────────

  it('insertScanEntries bulk-inserts and retrieves correctly', () => {
    const scanId = db.insertScan({ root_path: '/x', duration_ms: 50, total_size_bytes: 100, file_count: 1, directory_count: 0, skipped_count: 0 });
    db.insertScanEntries([
      { scan_id: scanId, path: '/x/node_modules', name: 'node_modules', size_bytes: 100, category: 'node_modules', is_directory: 1, is_hidden: 0 },
    ]);
    const entries = db.getEntriesByScanId(scanId);
    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('node_modules');
  });

  it('getEntriesByCategory filters correctly', () => {
    const scanId = db.insertScan({ root_path: '/y', duration_ms: 10, total_size_bytes: 0, file_count: 2, directory_count: 0, skipped_count: 0 });
    db.insertScanEntries([
      { scan_id: scanId, path: '/y/a', name: 'a', size_bytes: 10, category: 'cache', is_directory: 0, is_hidden: 0 },
      { scan_id: scanId, path: '/y/b', name: 'b', size_bytes: 20, category: 'log', is_directory: 0, is_hidden: 0 },
    ]);
    expect(db.getEntriesByCategory(scanId, 'cache')).toHaveLength(1);
    expect(db.getEntriesByCategory(scanId, 'log')).toHaveLength(1);
  });

  // ─── cleanup_events ────────────────────────────────────────────────────────

  it('insertCleanupEvent returns id and is queryable', () => {
    const id = db.insertCleanupEvent({ path: '/x/file.log', size_bytes: 500, rule_id: 'log', confirmed_at: new Date().toISOString() });
    expect(id).toBeGreaterThan(0);
    expect(db.getRecentCleanupEvents()).toHaveLength(1);
  });

  it('getTotalByteCleaned sums correctly', () => {
    db.insertCleanupEvent({ path: '/a', size_bytes: 1000, rule_id: 'r', confirmed_at: new Date().toISOString() });
    db.insertCleanupEvent({ path: '/b', size_bytes: 2000, rule_id: 'r', confirmed_at: new Date().toISOString() });
    expect(db.getTotalByteCleaned()).toBe(3000);
  });

  it('getTotalByteCleaned returns 0 for empty table', () => {
    expect(db.getTotalByteCleaned()).toBe(0);
  });

  // ─── settings ──────────────────────────────────────────────────────────────

  it('setSetting and getSetting round-trip', () => {
    db.setSetting('my_key', 'my_value');
    expect(db.getSetting('my_key')).toBe('my_value');
  });

  it('setSetting upserts on duplicate key', () => {
    db.setSetting('k', 'v1');
    db.setSetting('k', 'v2');
    expect(db.getSetting('k')).toBe('v2');
  });

  it('getSetting returns undefined for missing key', () => {
    expect(db.getSetting('nonexistent')).toBeUndefined();
  });

  // ─── migrations ────────────────────────────────────────────────────────────

  it('migrations are idempotent — opening db twice does not throw', () => {
    db.close();
    expect(() => { db = new DatabaseService(dbPath); }).not.toThrow();
  });
});
```

---

## Edge Cases

| Scenario | Handling |
|---|---|
| `~/.stacksweep/` does not exist | `fs.mkdirSync` with `recursive: true` on init |
| Database file is corrupted | `better-sqlite3` throws on open — catch, warn user, offer to reset |
| Very large scan (1M+ entries) | Use transactional batch insert (already done) — commit every 10,000 rows |
| Concurrent CLI processes writing simultaneously | WAL mode handles readers; for writers, `better-sqlite3` uses a per-process lock |
| Disk full during write | SQLite rolls back the transaction automatically; surface error to user |

---

## Deliverables

- [ ] `packages/database/` workspace package scaffolded and added to `pnpm-workspace.yaml`
- [ ] `better-sqlite3` and `@types/better-sqlite3` installed as dependencies
- [ ] `001_initial.sql` migration written and tested
- [ ] Migration runner implemented and idempotent
- [ ] All indexes created
- [ ] `DatabaseService` class implemented with all typed methods
- [ ] Transactional batch insert for `scan_entries`
- [ ] WAL mode and foreign keys enabled on startup
- [ ] Phase 5 plain-text cleanup log replaced with `db.insertCleanupEvents()`
- [ ] Legacy log migration implemented and gated behind settings flag
- [ ] `stacksweep history` command implemented with `--scans`, `--cleanups`, `--limit` flags
- [ ] `stacksweep config get <key>` reads from `config.json`
- [ ] `stacksweep config set <key> <value>` writes to `config.json` with validation
- [ ] All unit tests passing (`vitest run`)
- [ ] CI green on GitHub Actions

---

← [Phase 6 — Duplicate Finder](./phase-6-duplicate-finder.md) | [Phase 8 — Caching & Incremental Scanning](./phase-8-caching.md) →

---

### Completion Status Summary & Executable Commands
**Status**: Fully Implemented & Completed.
- Scaffolded `@sweep/database` package with `better-sqlite3` engine.
- Implemented SQLite migration runner in `packages/database/src/migrations/index.ts`.
- Created `DatabaseService` in `packages/database/src/database.ts` with WAL mode and typed table methods (`scans`, `scan_entries`, `cleanup_events`, `settings`).
- Integrated `DatabaseService` into `sweep scan` and `sweep clean` CLI commands for persistent history.
- Implemented `sweep history` CLI subcommand in `apps/cli/src/commands/history.ts` supporting `--scans`, `--cleanups`, `--limit`, and `--json`.
- Implemented `sweep config get` & `sweep config set` CLI subcommands in `apps/cli/src/commands/config.ts` targeting `~/.sweep/config.json`.

**Commands User Can Execute Now**:
- `sweep history [--scans] [--cleanups] [--limit <n>] [--json]`: Views past scan history and cleanup audit events.
- `sweep config get <key>` / `sweep config set <key> <value>`: Reads and writes user settings in `~/.sweep/config.json`.
