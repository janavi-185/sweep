# Phase 8 — Caching & Incremental Scanning

> **Goal:** Make repeated scans fast using a TTL-based cache stored in SQLite. Introduce incremental scanning so only directories whose `mtime` has changed since the last run are re-traversed. Cache misses fall through to a full scan of that subtree; cache hits return instantly.

---

## Objectives

- Implement a two-layer cache: in-memory (session) + SQLite-backed (persistent)
- Add a `cache_entries` table to the Phase 7 database schema
- Apply the cache-aside pattern with TTL expiry and `mtime`-based invalidation
- Introduce `--no-cache` flag to force a full fresh scan
- Add `stacksweep cache status` and `stacksweep cache clear` commands
- Report cache hit rate in `--verbose` mode
- Unit test all cache states: hit, miss, TTL expiry, mtime change

---

## Two-Layer Cache Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Scanner Request                    │
└──────────────────────┬──────────────────────────────┘
                       │
           ┌───────────▼───────────┐
           │  Layer 1: In-Memory   │  Map<string, CachedEntry>
           │  (current session)    │  cleared on process exit
           └───────────┬───────────┘
                  miss │
           ┌───────────▼───────────┐
           │  Layer 2: SQLite      │  cache_entries table
           │  (persistent)         │  survives between runs
           └───────────┬───────────┘
                  miss │
           ┌───────────▼───────────┐
           │  Full Filesystem Scan │  stat + readdir
           │  → store in both      │
           └───────────────────────┘
```

**Layer 1** is a plain `Map<string, CachedEntry>` held in the `CacheService` instance for the lifetime of the process. It prevents redundant SQLite reads when the same path is looked up multiple times in one session (e.g., during incremental merge).

**Layer 2** is the `cache_entries` SQLite table introduced in this phase. It persists across CLI invocations so a scan of `~/Projects` done yesterday can partially serve a scan today.

---

## Database Schema Addition

```sql
-- Migration 003_cache.sql

CREATE TABLE IF NOT EXISTS cache_entries (
  path              TEXT    PRIMARY KEY,
  scan_result       TEXT    NOT NULL,  -- JSON-serialised ScanResult for this subtree
  cached_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ttl_seconds       INTEGER NOT NULL DEFAULT 3600,
  mtime_at_cache_time TEXT  NOT NULL  -- ISO 8601 of directory mtime when cached
);

CREATE INDEX IF NOT EXISTS idx_cache_entries_cached_at ON cache_entries(cached_at);
```

> **Why store `scan_result` as JSON TEXT?** The shape of a scan result subtree is a recursive tree — not naturally relational. JSON serialisation keeps the schema simple and the query fast (single row read per path). For StackSweep's scale (<10 MB of cached data), this is fine.

---

## TypeScript Types

```typescript
// packages/database/src/types.ts (additions)

export interface CacheEntryRow {
  path: string;                 // PRIMARY KEY — absolute directory path
  scan_result: string;          // JSON string of DirectoryScanResult
  cached_at: string;            // ISO 8601
  ttl_seconds: number;
  mtime_at_cache_time: string;  // ISO 8601 mtime of the directory when cached
}

export interface CachedEntry {
  result: DirectoryScanResult;
  cachedAt: Date;
  ttlSeconds: number;
  mtimeAtCacheTime: Date;
}

// Resolved state of a cache lookup
export type CacheLookupResult =
  | { status: 'hit'; entry: CachedEntry }
  | { status: 'miss'; reason: 'not_found' | 'expired' | 'mtime_changed' | 'forced' };
```

---

## Cache-Aside Pattern

The cache-aside pattern keeps caching logic outside the scanner core — the scanner calls `CacheService.get(path, currentMtime)` and decides whether to use the result or scan fresh.

```typescript
// packages/cache/src/cache.service.ts

import type { DatabaseService } from '@stacksweep/database';
import type { CachedEntry, CacheLookupResult, DirectoryScanResult } from './types.js';

export class CacheService {
  private memoryCache = new Map<string, CachedEntry>();
  private stats = { hits: 0, misses: 0 };

  constructor(private db: DatabaseService) {}

  get(path: string, currentMtime: Date, forceRefresh = false): CacheLookupResult {
    if (forceRefresh) {
      return { status: 'miss', reason: 'forced' };
    }

    // Layer 1: memory
    const memEntry = this.memoryCache.get(path);
    if (memEntry) {
      const lookup = this.validate(memEntry, currentMtime);
      if (lookup.status === 'hit') { this.stats.hits++; return lookup; }
    }

    // Layer 2: SQLite
    const row = this.db.getCacheEntry(path);
    if (!row) {
      this.stats.misses++;
      return { status: 'miss', reason: 'not_found' };
    }

    const entry: CachedEntry = {
      result: JSON.parse(row.scan_result),
      cachedAt: new Date(row.cached_at),
      ttlSeconds: row.ttl_seconds,
      mtimeAtCacheTime: new Date(row.mtime_at_cache_time),
    };

    const lookup = this.validate(entry, currentMtime);
    if (lookup.status === 'hit') {
      this.memoryCache.set(path, entry); // warm L1
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }
    return lookup;
  }

  set(path: string, result: DirectoryScanResult, mtime: Date, ttlSeconds: number): void {
    const entry: CachedEntry = {
      result,
      cachedAt: new Date(),
      ttlSeconds,
      mtimeAtCacheTime: mtime,
    };
    this.memoryCache.set(path, entry);
    this.db.setCacheEntry({
      path,
      scan_result: JSON.stringify(result),
      ttl_seconds: ttlSeconds,
      mtime_at_cache_time: mtime.toISOString(),
    });
  }

  invalidate(path: string): void {
    this.memoryCache.delete(path);
    this.db.deleteCacheEntry(path);
  }

  clearAll(): number {
    this.memoryCache.clear();
    return this.db.clearAllCacheEntries();
  }

  getStats(): { hits: number; misses: number; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total === 0 ? 'N/A' : `${((this.stats.hits / total) * 100).toFixed(1)}%`;
    return { ...this.stats, hitRate };
  }

  private validate(entry: CachedEntry, currentMtime: Date): CacheLookupResult {
    const ageSeconds = (Date.now() - entry.cachedAt.getTime()) / 1000;
    if (ageSeconds > entry.ttlSeconds) {
      return { status: 'miss', reason: 'expired' };
    }
    if (currentMtime.getTime() !== entry.mtimeAtCacheTime.getTime()) {
      return { status: 'miss', reason: 'mtime_changed' };
    }
    return { status: 'hit', entry };
  }
}
```

---

## TTL Strategy

| Path pattern | Default TTL | Rationale |
|---|---|---|
| Any path | 3600s (1h) | Default — reasonable staleness for typical use |
| `**/DerivedData/**` | 900s (15m) | Xcode rebuilds frequently |
| `**/Docker.raw` or `**/com.docker/**` | 900s (15m) | Docker Desktop layers change often |
| `**/node_modules/**` | 7200s (2h) | Changes only on `npm install` |
| `~/.npm` / `~/.pnpm-store` | 7200s (2h) | Package manager caches are write-infrequent |

TTL is determined by a `getTtl(path: string): number` utility function that matches path patterns in order.

```typescript
// packages/cache/src/ttl.ts

const TTL_RULES: Array<{ pattern: RegExp; ttl: number }> = [
  { pattern: /DerivedData|com\.docker|Docker\.raw/i, ttl: 900 },
  { pattern: /node_modules|\.npm|\.pnpm-store/i,     ttl: 7200 },
];

export function getTtl(path: string): number {
  for (const rule of TTL_RULES) {
    if (rule.pattern.test(path)) return rule.ttl;
  }
  return 3600; // default
}
```

---

## Incremental Scanning

Incremental scanning is the core performance win. On a second scan of `~/Projects`:

1. Walk only the **top-level directories** to read their `mtime` via `fs.stat()`
2. For each top-level directory, call `cache.get(path, mtime)`
3. **Cache hit** → use cached subtree result, skip traversal entirely
4. **Cache miss** → scan that directory fully, write result to cache
5. Merge hit and miss results into the final scan output

```typescript
// packages/scanner/src/incremental-scanner.ts

export async function incrementalScan(
  rootPath: string,
  cache: CacheService,
  forceRefresh: boolean,
): Promise<ScanResult> {
  const topLevelEntries = await fs.promises.readdir(rootPath, { withFileTypes: true });
  const results: DirectoryScanResult[] = [];

  for (const entry of topLevelEntries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(rootPath, entry.name);
    const stat = await fs.promises.stat(fullPath);
    const mtime = stat.mtime;

    const lookup = cache.get(fullPath, mtime, forceRefresh);

    if (lookup.status === 'hit') {
      results.push(lookup.entry.result);
      // no filesystem traversal — subtree served from cache
    } else {
      const freshResult = await scanDirectory(fullPath); // full recursive scan
      cache.set(fullPath, freshResult, mtime, getTtl(fullPath));
      results.push(freshResult);
    }
  }

  return mergeScanResults(rootPath, results);
}
```

> [!NOTE]
> The granularity of cache entries is **top-level directories under the scan root**. This is a deliberate tradeoff — caching at deeper granularity would require more `stat()` calls and more cache rows. Top-level directories under `~/Projects` or `~/Documents` change independently and are a natural unit.

---

## Cache Invalidation

Four triggers invalidate a cache entry:

| Trigger | Mechanism |
|---|---|
| TTL expiry | `CacheService.validate()` checks `cachedAt + ttlSeconds < now` |
| Directory `mtime` changed | `validate()` compares stored `mtimeAtCacheTime` vs current `mtime` |
| `--no-cache` flag | `forceRefresh = true` passed into `cache.get()`, always returns `miss` |
| `stacksweep cache clear` | Calls `cache.clearAll()` — truncates table, clears memory |

> [!CAUTION]
> `mtime` on macOS is only reliable at **1-second granularity** for HFS+. APFS supports nanosecond precision. Do not use `===` on Date objects converted from mtime — compare `.getTime()` as integers but be aware of sub-second rounding when writing tests.

---

## `DatabaseService` Additions

```typescript
// packages/database/src/database.ts (additions to Phase 7 class)

getCacheEntry(path: string): CacheEntryRow | undefined {
  return this.db
    .prepare('SELECT * FROM cache_entries WHERE path = ?')
    .get(path) as CacheEntryRow | undefined;
}

setCacheEntry(entry: Omit<CacheEntryRow, 'cached_at'>): void {
  this.db.prepare(`
    INSERT INTO cache_entries (path, scan_result, ttl_seconds, mtime_at_cache_time)
    VALUES (@path, @scan_result, @ttl_seconds, @mtime_at_cache_time)
    ON CONFLICT(path) DO UPDATE SET
      scan_result = excluded.scan_result,
      cached_at   = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      ttl_seconds = excluded.ttl_seconds,
      mtime_at_cache_time = excluded.mtime_at_cache_time
  `).run(entry);
}

deleteCacheEntry(path: string): void {
  this.db.prepare('DELETE FROM cache_entries WHERE path = ?').run(path);
}

clearAllCacheEntries(): number {
  const result = this.db.prepare('DELETE FROM cache_entries').run();
  return result.changes;
}

getCacheStats(): { entryCount: number; totalSizeBytes: number; oldestEntry: string | null } {
  const row = this.db.prepare(`
    SELECT
      COUNT(*) as entryCount,
      SUM(LENGTH(scan_result)) as totalSizeBytes,
      MIN(cached_at) as oldestEntry
    FROM cache_entries
  `).get() as { entryCount: number; totalSizeBytes: number; oldestEntry: string | null };
  return row;
}
```

---

## CLI Commands

### `stacksweep cache status`

```
$ stacksweep cache status

  Cache Status
  ───────────────────────────────────────
  Entries:      142
  Size on disk: 4.2 MB
  Oldest entry: 2026-08-13 09:17 (2 days ago)
  Hit rate:     83.4%  (this session)
```

### `stacksweep cache clear`

```
$ stacksweep cache clear
  ✔ Cleared 142 cache entries.
```

### `stacksweep scan --no-cache`

Forces a full re-scan, ignoring all cached results. Cache is **not** cleared — it is simply bypassed and overwritten with fresh data.

### Verbose Mode: Cache Hit Rate

```
$ stacksweep scan ~/Projects --verbose

  [cache] ~/Projects/web-app         HIT  (age: 23m, mtime unchanged)
  [cache] ~/Projects/api             MISS (mtime changed 4m ago)
  [cache] ~/Projects/old-service     HIT  (age: 1h2m, mtime unchanged)
  ...
  Cache hit rate: 76/89 = 85.4%
```

---

## Performance Considerations

> [!TIP]
> Reading `mtime` via `fs.stat()` for 200 top-level directories takes ~5ms. Avoid calling `stat()` in a serial loop — use `Promise.all()` with a concurrency limit (see Phase 9 for `p-limit` integration).

**Tradeoffs to document in code comments:**
- Caching filesystem entries is I/O-sensitive. If the cache is wrong (stale mtime), the user sees incorrect results. Always err on the side of cache miss over a stale hit.
- `scan_result` JSON can be large for deeply nested directories. Monitor `cache_entries` table size with `stacksweep cache status`. If it exceeds 50 MB, consider eviction of oldest entries.
- Do not cache scan results for directories on network volumes (NFS, SMB) — mtime is unreliable over the network. Detect network mounts via `statfs()` or `mount` output.

---

## Unit Tests

File: `packages/cache/tests/cache.service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService } from '../src/cache.service.js';

// Use an in-memory mock DatabaseService
const mockDb = {
  getCacheEntry: vi.fn(),
  setCacheEntry: vi.fn(),
  deleteCacheEntry: vi.fn(),
  clearAllCacheEntries: vi.fn().mockReturnValue(0),
};

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new CacheService(mockDb as any);
  });

  it('returns miss for unknown path', () => {
    mockDb.getCacheEntry.mockReturnValue(undefined);
    const result = cache.get('/unknown', new Date());
    expect(result.status).toBe('miss');
    expect(result.reason).toBe('not_found');
  });

  it('returns hit for valid, unexpired, mtime-matching entry', () => {
    const mtime = new Date('2026-08-14T10:00:00Z');
    mockDb.getCacheEntry.mockReturnValue({
      path: '/some/dir',
      scan_result: JSON.stringify({ files: [] }),
      cached_at: new Date().toISOString(),   // fresh
      ttl_seconds: 3600,
      mtime_at_cache_time: mtime.toISOString(),
    });
    const result = cache.get('/some/dir', mtime);
    expect(result.status).toBe('hit');
  });

  it('returns miss with reason "expired" when TTL has elapsed', () => {
    const mtime = new Date('2026-08-14T10:00:00Z');
    const oldCachedAt = new Date(Date.now() - 4000 * 1000).toISOString(); // 4000s ago
    mockDb.getCacheEntry.mockReturnValue({
      path: '/old/dir',
      scan_result: JSON.stringify({}),
      cached_at: oldCachedAt,
      ttl_seconds: 3600,
      mtime_at_cache_time: mtime.toISOString(),
    });
    const result = cache.get('/old/dir', mtime);
    expect(result.status).toBe('miss');
    expect(result.reason).toBe('expired');
  });

  it('returns miss with reason "mtime_changed" when directory was modified', () => {
    const cachedMtime = new Date('2026-08-14T10:00:00Z');
    const currentMtime = new Date('2026-08-14T11:30:00Z'); // different
    mockDb.getCacheEntry.mockReturnValue({
      path: '/changed/dir',
      scan_result: JSON.stringify({}),
      cached_at: new Date().toISOString(),
      ttl_seconds: 3600,
      mtime_at_cache_time: cachedMtime.toISOString(),
    });
    const result = cache.get('/changed/dir', currentMtime);
    expect(result.status).toBe('miss');
    expect(result.reason).toBe('mtime_changed');
  });

  it('returns miss with reason "forced" when forceRefresh=true', () => {
    const result = cache.get('/any/path', new Date(), true);
    expect(result.status).toBe('miss');
    expect(result.reason).toBe('forced');
    expect(mockDb.getCacheEntry).not.toHaveBeenCalled();
  });

  it('warms L1 memory cache on SQLite hit', () => {
    const mtime = new Date('2026-08-15T08:00:00Z');
    mockDb.getCacheEntry.mockReturnValue({
      path: '/mem/path',
      scan_result: JSON.stringify({ files: [1, 2, 3] }),
      cached_at: new Date().toISOString(),
      ttl_seconds: 3600,
      mtime_at_cache_time: mtime.toISOString(),
    });
    cache.get('/mem/path', mtime); // first call → SQLite
    cache.get('/mem/path', mtime); // second call → memory (no extra DB call)
    expect(mockDb.getCacheEntry).toHaveBeenCalledTimes(1);
  });

  it('clearAll empties memory and calls db', () => {
    cache.clearAll();
    expect(mockDb.clearAllCacheEntries).toHaveBeenCalled();
  });

  it('getStats returns correct hit rate string', () => {
    // Simulate 3 hits and 1 miss via get() calls
    const mtime = new Date();
    mockDb.getCacheEntry.mockReturnValue({
      path: '/p', scan_result: '{}',
      cached_at: new Date().toISOString(), ttl_seconds: 3600,
      mtime_at_cache_time: mtime.toISOString(),
    });
    cache.get('/p', mtime); // hit
    cache.get('/p', mtime); // hit (L1)
    mockDb.getCacheEntry.mockReturnValue(undefined);
    cache.get('/q', new Date()); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
  });
});
```

---

## Deliverables

- [ ] `packages/cache/` workspace package scaffolded
- [ ] `003_cache.sql` migration added and tested
- [ ] `CacheService` implemented with two-layer lookup (memory + SQLite)
- [ ] `CacheService.validate()` correctly checks TTL and mtime
- [ ] `getTtl()` function with path-pattern rules
- [ ] `DatabaseService` extended with cache CRUD methods
- [ ] `--no-cache` flag wired into `stacksweep scan`
- [ ] Incremental scanning implemented at top-level directory granularity
- [ ] `stacksweep cache status` command shows entry count, size, hit rate, oldest entry
- [ ] `stacksweep cache clear` command clears table and memory
- [ ] `--verbose` flag prints per-directory cache hit/miss with reason
- [ ] Network volume detection — skip caching for network mounts
- [ ] All unit tests passing
- [ ] CI green on GitHub Actions

---

← [Phase 7 — SQLite Persistence](./phase-7-sqlite-persistence.md) | [Phase 9 — Concurrency & Performance](./phase-9-concurrency.md) →
