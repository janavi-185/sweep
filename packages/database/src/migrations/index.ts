import type { DatabaseSyncInterface } from '../types.js';

export const INITIAL_SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS scan_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id      INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  path         TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  size_bytes   INTEGER NOT NULL,
  category     TEXT    NOT NULL,
  is_directory INTEGER NOT NULL,
  is_hidden    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cleanup_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cleaned_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  path         TEXT    NOT NULL,
  size_bytes   INTEGER NOT NULL,
  rule_id      TEXT    NOT NULL,
  confirmed_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_scans_root_path   ON scans(root_path);
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at  ON scans(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_entries_scan_id  ON scan_entries(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_entries_category ON scan_entries(category);
CREATE INDEX IF NOT EXISTS idx_cleanup_events_cleaned_at ON cleanup_events(cleaned_at DESC);
`;

export function runMigrations(db: DatabaseSyncInterface): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as unknown as {
    version: number;
  }[];
  const applied = new Set<number>(appliedRows.map((r) => r.version));

  if (!applied.has(1)) {
    db.exec(INITIAL_SCHEMA_SQL);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(1);
  }
}
