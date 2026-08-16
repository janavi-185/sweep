export interface DatabaseSyncInterface {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): StatementSyncInterface;
}

export interface StatementSyncInterface {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface ScanRow {
  id: number;
  root_path: string;
  scanned_at: string;
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
  category: string;
  is_directory: 0 | 1;
  is_hidden: 0 | 1;
}

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

export type NewScan = Omit<ScanRow, 'id' | 'scanned_at'>;
export type NewScanEntry = Omit<ScanEntryRow, 'id'>;
export type NewCleanupEvent = Omit<CleanupEventRow, 'id' | 'cleaned_at'>;
