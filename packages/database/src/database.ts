import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations/index';
import type {
  ScanRow,
  ScanEntryRow,
  CleanupEventRow,
  SettingRow,
  CacheEntryRow,
  NewScan,
  NewScanEntry,
  NewCleanupEvent,
} from './types';

export class DatabaseService {
  private db: Database.Database;

  constructor(customPath?: string) {
    const dbPath = customPath || DatabaseService.getDefaultDbPath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
  }

  public static getDefaultDbPath(): string {
    return path.join(os.homedir(), '.sweep', 'sweep.db');
  }

  // --- Scans ---

  insertScan(scan: NewScan): number {
    const stmt = this.db.prepare(`
      INSERT INTO scans (root_path, duration_ms, total_size_bytes, file_count, directory_count, skipped_count)
      VALUES (@root_path, @duration_ms, @total_size_bytes, @file_count, @directory_count, @skipped_count)
    `);
    const result = stmt.run(scan);
    return Number(result.lastInsertRowid);
  }

  getRecentScans(limit = 10): ScanRow[] {
    return this.db
      .prepare('SELECT * FROM scans ORDER BY scanned_at DESC LIMIT ?')
      .all(limit) as ScanRow[];
  }

  getScanById(id: number): ScanRow | undefined {
    return this.db.prepare('SELECT * FROM scans WHERE id = ?').get(id) as ScanRow | undefined;
  }

  // --- Scan Entries ---

  insertScanEntries(entries: NewScanEntry[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO scan_entries (scan_id, path, name, size_bytes, category, is_directory, is_hidden)
      VALUES (@scan_id, @path, @name, @size_bytes, @category, @is_directory, @is_hidden)
    `);
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

  // --- Cleanup Events ---

  insertCleanupEvent(event: NewCleanupEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO cleanup_events (path, size_bytes, rule_id, confirmed_at)
      VALUES (@path, @size_bytes, @rule_id, @confirmed_at)
    `);
    const result = stmt.run(event);
    return Number(result.lastInsertRowid);
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

  // --- Settings ---

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
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
    return this.db.prepare('SELECT * FROM settings ORDER BY key').all() as SettingRow[];
  }

  // --- Cache Entries ---

  getCacheEntry(path: string): CacheEntryRow | undefined {
    return this.db.prepare('SELECT * FROM cache_entries WHERE path = ?').get(path) as
      CacheEntryRow | undefined;
  }

  setCacheEntry(entry: Omit<CacheEntryRow, 'cached_at'>): void {
    this.db
      .prepare(
        `
      INSERT INTO cache_entries (path, scan_result, ttl_seconds, mtime_at_cache_time)
      VALUES (@path, @scan_result, @ttl_seconds, @mtime_at_cache_time)
      ON CONFLICT(path) DO UPDATE SET
        scan_result = excluded.scan_result,
        cached_at   = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        ttl_seconds = excluded.ttl_seconds,
        mtime_at_cache_time = excluded.mtime_at_cache_time
    `,
      )
      .run(entry);
  }

  deleteCacheEntry(path: string): void {
    this.db.prepare('DELETE FROM cache_entries WHERE path = ?').run(path);
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
      .get() as { entryCount: number; totalSizeBytes: number; oldestEntry: string | null };
    return row;
  }

  close(): void {
    this.db.close();
  }
}
