import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  DatabaseSyncInterface,
  ScanRow,
  ScanEntryRow,
  CleanupEventRow,
  SettingRow,
  CacheEntryRow,
  NewScan,
  NewScanEntry,
  NewCleanupEvent,
} from '@sweep/types';
import { runMigrations } from './migrations/index.js';

function loadDatabaseSync(): new (
  location: string,
  options?: { open?: boolean },
) => DatabaseSyncInterface {
  const req = eval('require');
  const sqlite = req('node:sqlite');
  return sqlite.DatabaseSync;
}

export class DatabaseService {
  private db: DatabaseSyncInterface;

  constructor(customPath?: string) {
    const dbPath = customPath || DatabaseService.getDefaultDbPath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const DatabaseSync = loadDatabaseSync();
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    runMigrations(this.db);
  }

  public static getDefaultDbPath(): string {
    return path.join(os.homedir(), '.sweep', 'sweep.db');
  }

  // --- Scans ---

  insertScan(scan: NewScan): number {
    const stmt = this.db.prepare(`
      INSERT INTO scans (root_path, duration_ms, total_size_bytes, file_count, directory_count, skipped_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      scan.root_path,
      scan.duration_ms,
      scan.total_size_bytes,
      scan.file_count,
      scan.directory_count,
      scan.skipped_count,
    );
    return Number(result.lastInsertRowid);
  }

  getRecentScans(limit = 10): ScanRow[] {
    return this.db
      .prepare('SELECT * FROM scans ORDER BY scanned_at DESC LIMIT ?')
      .all(limit) as unknown as ScanRow[];
  }

  getScanById(id: number): ScanRow | undefined {
    return this.db.prepare('SELECT * FROM scans WHERE id = ?').get(id) as unknown as
      ScanRow | undefined;
  }

  // --- Scan Entries ---

  insertScanEntries(entries: NewScanEntry[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO scan_entries (scan_id, path, name, size_bytes, category, is_directory, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of entries) {
      stmt.run(
        row.scan_id,
        row.path,
        row.name,
        row.size_bytes,
        row.category,
        row.is_directory,
        row.is_hidden,
      );
    }
  }

  getEntriesByScanId(scanId: number): ScanEntryRow[] {
    return this.db
      .prepare('SELECT * FROM scan_entries WHERE scan_id = ?')
      .all(scanId) as unknown as ScanEntryRow[];
  }

  getEntriesByCategory(scanId: number, category: string): ScanEntryRow[] {
    return this.db
      .prepare('SELECT * FROM scan_entries WHERE scan_id = ? AND category = ?')
      .all(scanId, category) as unknown as ScanEntryRow[];
  }

  // --- Cleanup Events ---

  insertCleanupEvent(event: NewCleanupEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO cleanup_events (path, size_bytes, rule_id, confirmed_at)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(event.path, event.size_bytes, event.rule_id, event.confirmed_at);
    return Number(result.lastInsertRowid);
  }

  insertCleanupEvents(events: NewCleanupEvent[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO cleanup_events (path, size_bytes, rule_id, confirmed_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const row of events) {
      stmt.run(row.path, row.size_bytes, row.rule_id, row.confirmed_at);
    }
  }

  getRecentCleanupEvents(limit = 20): CleanupEventRow[] {
    return this.db
      .prepare('SELECT * FROM cleanup_events ORDER BY cleaned_at DESC LIMIT ?')
      .all(limit) as unknown as CleanupEventRow[];
  }

  getTotalByteCleaned(): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM cleanup_events')
      .get() as unknown as { total: number };
    return row ? Number(row.total) : 0;
  }

  // --- Settings ---

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as unknown as
      Pick<SettingRow, 'value'> | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
      )
      .run(key, value);
  }

  getAllSettings(): SettingRow[] {
    return this.db.prepare('SELECT * FROM settings ORDER BY key').all() as unknown as SettingRow[];
  }

  // --- Cache Entries ---

  getCacheEntry(pathName: string): CacheEntryRow | undefined {
    const row = this.db.prepare('SELECT * FROM cache_entries WHERE path = ?').get(pathName);
    return (row as unknown as CacheEntryRow) || undefined;
  }

  setCacheEntry(entry: Omit<CacheEntryRow, 'cached_at'>): void {
    this.db
      .prepare(
        `
      INSERT INTO cache_entries (path, scan_result, ttl_seconds, mtime_at_cache_time)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        scan_result = excluded.scan_result,
        cached_at   = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        ttl_seconds = excluded.ttl_seconds,
        mtime_at_cache_time = excluded.mtime_at_cache_time
    `,
      )
      .run(entry.path, entry.scan_result, entry.ttl_seconds, entry.mtime_at_cache_time);
  }

  deleteCacheEntry(pathName: string): void {
    this.db.prepare('DELETE FROM cache_entries WHERE path = ?').run(pathName);
  }

  clearAllCacheEntries(): number {
    const result = this.db.prepare('DELETE FROM cache_entries').run();
    return Number(result.changes);
  }

  getCacheStats(): { entryCount: number; totalSizeBytes: number; oldestEntry: string | null } {
    const row = this.db
      .prepare(
        `
      SELECT
        COUNT(*) as entryCount,
        COALESCE(SUM(LENGTH(scan_result)), 0) as totalSizeBytes,
        MIN(cached_at) as oldestEntry
      FROM cache_entries
    `,
      )
      .get() as unknown as {
      entryCount: number;
      totalSizeBytes: number;
      oldestEntry: string | null;
    };
    return row || { entryCount: 0, totalSizeBytes: 0, oldestEntry: null };
  }

  close(): void {
    this.db.close();
  }
}
