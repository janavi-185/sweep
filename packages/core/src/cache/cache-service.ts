import { DatabaseService } from '@sweep/database';
import { ScanResult } from '@sweep/types';

export interface CachedEntry {
  result: ScanResult;
  cachedAt: Date;
  ttlSeconds: number;
  mtimeAtCacheTime: Date;
}

export type CacheLookupResult =
  | { status: 'hit'; entry: CachedEntry }
  | { status: 'miss'; reason: 'not_found' | 'expired' | 'mtime_changed' | 'forced' };

export class CacheService {
  private memoryCache = new Map<string, CachedEntry>();
  private stats = { hits: 0, misses: 0 };
  private db: DatabaseService;

  constructor(customDb?: DatabaseService) {
    this.db = customDb || new DatabaseService();
  }

  get(targetPath: string, currentMtime: Date, forceRefresh = false): CacheLookupResult {
    if (forceRefresh) {
      this.stats.misses++;
      return { status: 'miss', reason: 'forced' };
    }

    // Layer 1: Memory
    const memEntry = this.memoryCache.get(targetPath);
    if (memEntry) {
      const lookup = this.validate(memEntry, currentMtime);
      if (lookup.status === 'hit') {
        this.stats.hits++;
        return lookup;
      }
    }

    // Layer 2: SQLite
    const row = this.db.getCacheEntry(targetPath);
    if (!row) {
      this.stats.misses++;
      return { status: 'miss', reason: 'not_found' };
    }

    try {
      const entry: CachedEntry = {
        result: JSON.parse(row.scan_result),
        cachedAt: new Date(row.cached_at),
        ttlSeconds: row.ttl_seconds,
        mtimeAtCacheTime: new Date(row.mtime_at_cache_time),
      };

      const lookup = this.validate(entry, currentMtime);
      if (lookup.status === 'hit') {
        this.memoryCache.set(targetPath, entry); // Warm L1
        this.stats.hits++;
      } else {
        this.stats.misses++;
      }
      return lookup;
    } catch {
      this.stats.misses++;
      return { status: 'miss', reason: 'not_found' };
    }
  }

  set(targetPath: string, result: ScanResult, mtime: Date, ttlSeconds: number): void {
    const entry: CachedEntry = {
      result,
      cachedAt: new Date(),
      ttlSeconds,
      mtimeAtCacheTime: mtime,
    };
    this.memoryCache.set(targetPath, entry);
    this.db.setCacheEntry({
      path: targetPath,
      scan_result: JSON.stringify(result),
      ttl_seconds: ttlSeconds,
      mtime_at_cache_time: mtime.toISOString(),
    });
  }

  invalidate(targetPath: string): void {
    this.memoryCache.delete(targetPath);
    this.db.deleteCacheEntry(targetPath);
  }

  clearAll(): number {
    this.memoryCache.clear();
    return this.db.clearAllCacheEntries();
  }

  getDbStats(): { entryCount: number; totalSizeBytes: number; oldestEntry: string | null } {
    return this.db.getCacheStats();
  }

  getStats(): { hits: number; misses: number; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total === 0 ? 'N/A' : `${((this.stats.hits / total) * 100).toFixed(1)}%`;
    return { ...this.stats, hitRate };
  }

  close(): void {
    this.db.close();
  }

  private validate(entry: CachedEntry, currentMtime: Date): CacheLookupResult {
    const ageSeconds = (Date.now() - entry.cachedAt.getTime()) / 1000;
    if (ageSeconds > entry.ttlSeconds) {
      return { status: 'miss', reason: 'expired' };
    }
    if (
      Math.floor(currentMtime.getTime() / 1000) !==
      Math.floor(entry.mtimeAtCacheTime.getTime() / 1000)
    ) {
      return { status: 'miss', reason: 'mtime_changed' };
    }
    return { status: 'hit', entry };
  }
}
