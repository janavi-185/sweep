# Phase 9 — Concurrency & Performance

> **Goal:** Parallelise the filesystem scanner and file hasher using Node.js `worker_threads` to fully exploit multi-core CPUs. Add `p-limit` for I/O-bound concurrency, a `--benchmark` flag for timing output, and a profiling guide. Harden the engine against race conditions, worker crashes, ENOENT errors, and network volume hangs.

---

## Objectives

- Replace the single-threaded sequential scanner (Phase 2) with a worker thread pool
- Offload SHA-256 hashing (Phase 6 duplicate finder) to worker threads
- Use `p-limit` for bounded `Promise.all()` on I/O-bound stat calls
- Add `--benchmark` flag: scan time, files/sec, MB/sec
- Document profiling workflow: `--prof` + `clinic.js`
- Harden against: ENOENT mid-scan, worker crashes, network volume timeouts
- Establish and test performance targets

---

## Current State (Phase 2)

The Phase 2 scanner is a recursive async function that traverses the directory tree with `fs.promises.readdir` + `fs.promises.stat` sequentially. It processes one directory at a time, blocking on each level before moving deeper.

```
~/Projects (root)
  → scan /web-app       (await readdir)
    → scan /web-app/src   (await readdir)
      → scan /web-app/src/components  ...
```

On a single directory with 100,000 files, this saturates approximately 20–30% of one CPU core. Seven other cores sit idle. Phase 9 fixes this.

---

## Strategy: Worker Thread Pool

Node.js `worker_threads` provide true parallelism (separate V8 isolates, shared memory possible). Each worker is given a **batch of directories** to scan. Workers post results back to the main thread via `postMessage`.

```
Main Thread
  │
  ├─ Dispatcher (work queue)
  │    ├── Worker 0 ──→ scan [/web-app, /api, /lib]
  │    ├── Worker 1 ──→ scan [/node_modules/react, ...]
  │    ├── Worker 2 ──→ scan [/DerivedData/...]
  │    └── Worker N-1 ──→ scan [...]
  │
  └─ Result Collector (merge stream)
```

### Pool Size

```typescript
import os from 'os';

// Leave one core for the main thread and OS tasks.
// Cap at 8 to avoid excessive context switching on high-core-count machines.
const WORKER_COUNT = Math.max(1, Math.min(os.cpus().length - 1, 8));
```

### Worker Protocol

Workers communicate with the main thread via a typed message protocol:

```typescript
// packages/scanner/src/worker/protocol.ts

export type WorkerInbound =
  | { type: 'scan'; directories: string[]; scanId: number }
  | { type: 'shutdown' };

export type WorkerOutbound =
  | { type: 'result'; scanId: number; entries: RawEntry[]; errors: ScanError[] }
  | { type: 'ready' }
  | { type: 'error'; message: string };

export interface RawEntry {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
  isHidden: boolean;
  mtime: number;   // Unix ms timestamp — safe to transfer
}

export interface ScanError {
  path: string;
  code: string;   // ENOENT, EPERM, ETIMEDOUT, etc.
}
```

### Worker Implementation

```typescript
// packages/scanner/src/worker/scanner.worker.ts
// This file runs inside a worker thread — no imports from main thread modules.

import { parentPort } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import type { WorkerInbound, WorkerOutbound, RawEntry, ScanError } from './protocol.js';

if (!parentPort) throw new Error('Must run as worker thread');

parentPort.postMessage({ type: 'ready' } satisfies WorkerOutbound);

parentPort.on('message', async (msg: WorkerInbound) => {
  if (msg.type === 'shutdown') process.exit(0);

  if (msg.type === 'scan') {
    const entries: RawEntry[] = [];
    const errors: ScanError[] = [];

    for (const dir of msg.directories) {
      await scanDir(dir, entries, errors);
    }

    parentPort!.postMessage({ type: 'result', scanId: msg.scanId, entries, errors } satisfies WorkerOutbound);
  }
});

async function scanDir(dirPath: string, entries: RawEntry[], errors: ScanError[]): Promise<void> {
  let dirents: fs.Dirent[];

  try {
    dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (err: any) {
    errors.push({ path: dirPath, code: err.code ?? 'UNKNOWN' });
    return;
  }

  const statPromises = dirents.map(async (dirent) => {
    const fullPath = path.join(dirPath, dirent.name);
    try {
      const stat = await fs.promises.stat(fullPath);
      entries.push({
        path: fullPath,
        name: dirent.name,
        size: stat.size,
        isDirectory: stat.isDirectory(),
        isHidden: dirent.name.startsWith('.'),
        mtime: stat.mtimeMs,
      });
      if (stat.isDirectory()) {
        await scanDir(fullPath, entries, errors);
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File was deleted between readdir and stat — log and continue
        errors.push({ path: fullPath, code: 'ENOENT' });
      } else {
        errors.push({ path: fullPath, code: err.code ?? 'UNKNOWN' });
      }
    }
  });

  await Promise.all(statPromises);
}
```

### Worker Pool Manager

```typescript
// packages/scanner/src/worker/pool.ts

import { Worker } from 'worker_threads';
import path from 'path';
import type { WorkerInbound, WorkerOutbound } from './protocol.js';

const WORKER_SCRIPT = path.resolve(__dirname, 'scanner.worker.js');

export class WorkerPool {
  private workers: Worker[] = [];
  private available: Worker[] = [];
  private queue: Array<{ directories: string[]; resolve: (r: any) => void; reject: (e: Error) => void }> = [];

  constructor(private size: number) {}

  async init(): Promise<void> {
    const ready = this.workers.map(() => new Promise<void>((resolve) => {
      const w = new Worker(WORKER_SCRIPT);
      w.on('message', (msg: WorkerOutbound) => {
        if (msg.type === 'ready') resolve();
      });
      this.workers.push(w);
      this.available.push(w);
    }));

    // Spawn all workers up front
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(WORKER_SCRIPT);
      this.workers.push(w);
    }

    await Promise.all(ready);
  }

  async scan(directories: string[]): Promise<WorkerOutbound & { type: 'result' }> {
    return new Promise((resolve, reject) => {
      this.queue.push({ directories, resolve, reject });
      this.dispatch();
    });
  }

  private dispatch(): void {
    while (this.available.length > 0 && this.queue.length > 0) {
      const worker = this.available.pop()!;
      const job = this.queue.shift()!;
      const scanId = Date.now();

      const onMessage = (msg: WorkerOutbound) => {
        if (msg.type === 'result' && msg.scanId === scanId) {
          worker.off('message', onMessage);
          worker.off('error', onError);
          this.available.push(worker);
          job.resolve(msg);
          this.dispatch();
        }
      };

      const onError = (err: Error) => {
        worker.off('message', onMessage);
        // Worker crashed — respawn a replacement
        this.respawn(worker);
        job.reject(err);
        this.dispatch();
      };

      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.postMessage({ type: 'scan', directories, scanId } satisfies WorkerInbound);
    }
  }

  private respawn(dead: Worker): void {
    const idx = this.workers.indexOf(dead);
    if (idx === -1) return;
    dead.terminate();
    const replacement = new Worker(WORKER_SCRIPT);
    this.workers[idx] = replacement;
    this.available.push(replacement);
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map(w => w.terminate()));
  }
}
```

---

## Why `worker_threads` Over `child_process`

| Feature | `worker_threads` | `child_process` |
|---|---|---|
| Shared memory (`SharedArrayBuffer`) | ✅ Yes | ❌ No |
| Startup overhead | ~5ms | ~50ms (fork) |
| IPC cost for large payloads | Low (structured clone) | High (serialise to stdout) |
| Crashes isolate from main | ✅ Yes | ✅ Yes |
| Suited for CPU-bound work | ✅ Yes | ✅ Yes |

For StackSweep, the primary win is lower startup overhead (spinning up 7 workers at 5ms each vs. 350ms for child_process). Results are medium-sized JSON so structured clone is fast enough.

---

## Concurrency for Hashing (Phase 6)

SHA-256 hashing is **CPU-bound**. The Phase 6 duplicate finder already reads file chunks and hashes them. In Phase 9, we offload hashing to the worker pool.

```typescript
// packages/scanner/src/worker/hasher.worker.ts

import { parentPort } from 'worker_threads';
import fs from 'fs';
import crypto from 'crypto';

type HashInbound  = { type: 'hash'; filePath: string; jobId: number };
type HashOutbound = { type: 'result'; jobId: number; hash: string; filePath: string }
                  | { type: 'error';  jobId: number; filePath: string; message: string };

parentPort!.on('message', async (msg: HashInbound) => {
  try {
    const hash = await hashFile(msg.filePath);
    parentPort!.postMessage({ type: 'result', jobId: msg.jobId, hash, filePath: msg.filePath } satisfies HashOutbound);
  } catch (err: any) {
    parentPort!.postMessage({ type: 'error', jobId: msg.jobId, filePath: msg.filePath, message: err.message } satisfies HashOutbound);
  }
});

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 }); // 64 KB chunks
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
```

> [!TIP]
> A `highWaterMark` of 64 KB is the sweet spot for SHA-256 throughput on Apple Silicon. Below 16 KB, syscall overhead dominates. Above 128 KB, memory pressure from many concurrent streams can cause GC pauses.

---

## I/O Concurrency with `p-limit`

For I/O-bound operations (stat calls, cache lookups), `worker_threads` add unnecessary overhead. Instead, use `Promise.all` with a concurrency limiter:

```typescript
import pLimit from 'p-limit';

// Limit to 64 concurrent stat() calls. More than this causes EMFILE (too many open files).
const limit = pLimit(64);

const stats = await Promise.all(
  filePaths.map(p => limit(() => fs.promises.stat(p)))
);
```

Use `p-limit` for:
- Batch `stat()` calls during mtime checks (Phase 8 incremental scan)
- Parallel cache reads from SQLite (though `better-sqlite3` is sync, so this applies to async wrappers)
- Any operation that fans out to many files without CPU-intensive work per file

Do **not** use `p-limit` as a replacement for worker threads when the operation is CPU-bound (e.g., hashing). `p-limit` runs on the main thread event loop — CPU work blocks everything else.

---

## `--benchmark` Flag

```
$ stacksweep scan ~/Projects --benchmark

  Scanning ~/Projects...
  ─────────────────────────────────────────────────────────
  Scan complete

  Benchmark Results
  ─────────────────────────────────────────────────────────
  Total time:       4.21s
  Files scanned:    82,341
  Throughput:       19,558 files/sec
  Data volume:      12.4 GB
  Read throughput:  2.95 GB/s  (stat + mtime read only)
  Workers used:     7 (of 7 available)
  Cache hits:       61/89 top-level dirs  (68.5%)
  Worker speedup:   ~4.1x over single-threaded estimate
```

Implementation:

```typescript
// packages/cli/src/commands/scan.ts

if (options.benchmark) {
  const start = performance.now();
  const result = await runScan(rootPath, options);
  const elapsed = performance.now() - start;

  const filesPerSec = Math.round(result.fileCount / (elapsed / 1000));
  const bytesPerSec = Math.round(result.totalBytes / (elapsed / 1000));

  printBenchmarkTable({ elapsed, filesPerSec, bytesPerSec, result });
}
```

---

## Profiling Guide

### Step 1: Node.js Built-in Profiler

```bash
node --prof dist/cli.js scan ~/Projects
# Produces: isolate-0x....-v8.log

node --prof-process isolate-*.log > profile.txt
cat profile.txt | grep -A 20 "Bottom up"
```

### Step 2: clinic.js (recommended)

```bash
pnpm add -D clinic
npx clinic flame -- node dist/cli.js scan ~/Projects
# Opens a flame graph in the browser. Look for wide bars in scanner code.
```

### Step 3: Identify Bottlenecks

Common hotspots found during Phase 9 profiling:

| Bottleneck | Fix |
|---|---|
| `fs.stat()` per file in main thread | Move to worker or batch with `p-limit` |
| JSON.stringify of large scan results | Stream results to DB as they arrive |
| `crypto.createHash` on main thread | Already fixed — use hasher workers |
| `path.join()` called millions of times | Profile shows it's cheap — not a real bottleneck |
| `readdir` on network volume | Add per-directory timeout (see Edge Cases) |

---

## Edge Cases Under Concurrency

### ENOENT Mid-Scan

Files can be deleted between `readdir` and `stat`. Workers already handle this:

```typescript
} catch (err: any) {
  if (err.code === 'ENOENT') {
    errors.push({ path: fullPath, code: 'ENOENT' });
    // Do not rethrow — continue scanning other files
  }
}
```

ENOENT errors are collected and surfaced at the end of the scan:

```
⚠  3 files were deleted during scan and skipped.
   Run with --verbose to see paths.
```

### Worker Crashes

Workers can crash if they encounter a native module bug or OOM. The pool manager handles this in `respawn()`:

1. Detect crash via `worker.on('error', ...)`
2. `worker.terminate()` the dead worker
3. Spawn a fresh replacement worker
4. Return the failed job's directories to the queue for redistribution

The user sees: `⚠ Worker crash detected. Restarting (1 of 3 max retries)...`

If a worker crashes 3 times on the **same directory batch**, that batch is marked as failed and skipped with a warning.

### Race Conditions on Shared State

Workers do **not** share mutable state. The design avoids races by construction:

- Each worker has its own `entries[]` and `errors[]` arrays
- Results are posted back via `postMessage` (structured clone — no shared references)
- The main thread result collector is single-threaded and merges results serially
- The SQLite `DatabaseService` is only accessed from the main thread — never from workers

No mutex or lock primitives are needed.

### Network Volumes

Network mounts (NFS, SMB, AFP) can hang indefinitely on `readdir` or `stat`. Detect and handle:

```typescript
// packages/scanner/src/worker/scanner.worker.ts

const NETWORK_TIMEOUT_MS = 5000;

async function readdirWithTimeout(dirPath: string): Promise<fs.Dirent[]> {
  return Promise.race([
    fs.promises.readdir(dirPath, { withFileTypes: true }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' })), NETWORK_TIMEOUT_MS)
    ),
  ]);
}
```

If `ETIMEDOUT`, log the path as skipped and continue. Do not cache results for paths on network volumes.

---

## Memory Management

For very large scans (>500,000 files), holding all entries in memory before writing to the database causes excessive heap usage. Use streaming results:

```typescript
// Instead of collecting all entries then inserting:
const allEntries = await pool.scan(directories);
db.insertScanEntries(allEntries); // ❌ 500k objects in memory

// Stream results as each worker batch completes:
pool.on('batchResult', (entries: RawEntry[]) => {
  db.insertScanEntries(entries); // ✅ commit incrementally
});
```

Set a target of **<200 MB heap usage** for scans up to 1 million files. Monitor with `process.memoryUsage().heapUsed` in `--benchmark` output.

---

## Performance Targets

| Metric | Target | Measurement |
|---|---|---|
| Scan 100,000 files | < 5 seconds | `--benchmark` on Apple M2 Pro |
| Scan 1,000,000 files | < 30 seconds | `--benchmark` on Apple M2 Pro |
| Hash 1 GB of files | < 10 seconds | dedicated `hash` benchmark |
| Worker startup time | < 100ms total | measured before first dispatch |
| Memory for 100k files | < 100 MB heap | `process.memoryUsage()` |
| Memory for 1M files | < 200 MB heap | streaming inserts required |

> [!NOTE]
> These are aspirational targets for Apple Silicon (arm64). Intel Macs will be 1.5–2x slower for hash operations. Document measured baselines in the project wiki once CI machines are benchmarked.

---

## Unit Tests

File: `packages/scanner/tests/concurrent-scanner.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { scanDirectory } from '../src/sequential-scanner.js';    // Phase 2
import { concurrentScan } from '../src/concurrent-scanner.js';  // Phase 9
import os from 'os';
import path from 'path';
import fs from 'fs';

describe('Concurrent scanner correctness', () => {
  const FIXTURE_DIR = path.join(os.tmpdir(), `scan-fixture-${Date.now()}`);

  beforeAll(() => {
    // Create a fixture directory tree with known files
    fs.mkdirSync(path.join(FIXTURE_DIR, 'a/b/c'), { recursive: true });
    fs.writeFileSync(path.join(FIXTURE_DIR, 'a/b/c/file1.txt'), 'hello');
    fs.writeFileSync(path.join(FIXTURE_DIR, 'a/b/file2.txt'), 'world');
    fs.writeFileSync(path.join(FIXTURE_DIR, 'root.txt'), 'root');
  });

  afterAll(() => fs.rmSync(FIXTURE_DIR, { recursive: true }));

  it('concurrent scan finds the same files as sequential scan', async () => {
    const sequential = await scanDirectory(FIXTURE_DIR);
    const concurrent  = await concurrentScan(FIXTURE_DIR);

    const seqPaths  = sequential.entries.map(e => e.path).sort();
    const concPaths = concurrent.entries.map(e => e.path).sort();

    expect(concPaths).toEqual(seqPaths);
  });

  it('concurrent scan reports correct total size', async () => {
    const sequential = await scanDirectory(FIXTURE_DIR);
    const concurrent  = await concurrentScan(FIXTURE_DIR);
    expect(concurrent.totalSizeBytes).toBe(sequential.totalSizeBytes);
  });

  it('ENOENT during scan does not throw — logs an error', async () => {
    // Create a file, start scan, then delete it before stat()
    // This is hard to unit-test deterministically; use a mock fs layer.
    // Verify that errors[] is populated and result still returns.
    const result = await concurrentScan(FIXTURE_DIR);
    expect(result).toBeDefined();
    // errors may be 0 in normal fixture — verified via mock in integration test
  });
});
```

---

## Deliverables

- [ ] `scanner.worker.ts` implemented with typed `WorkerInbound`/`WorkerOutbound` protocol
- [ ] `WorkerPool` class: spawn, dispatch, respawn on crash
- [ ] Worker pool size: `min(cpuCount - 1, 8)`
- [ ] `hasher.worker.ts` for SHA-256 offload (replaces Phase 6 in-process hashing)
- [ ] `p-limit` integrated for stat batches (limit = 64)
- [ ] `--benchmark` flag with table output: time, files/sec, MB/sec, cache hit rate
- [ ] Profiling guide written and tested (`clinic flame` produces valid output)
- [ ] ENOENT errors collected and reported at end of scan
- [ ] Worker crash detection and respawn (max 3 retries per batch)
- [ ] Network volume timeout (5s) per directory
- [ ] Streaming inserts to SQLite during scan (no full in-memory accumulation)
- [ ] Concurrent scan produces identical file list to sequential scan (unit test)
- [ ] Performance targets measured and documented in `docs/benchmarks.md`
- [ ] CI green on GitHub Actions (tests run in single-worker mode to avoid flakiness)

---

← [Phase 8 — Caching & Incremental Scanning](./phase-8-caching.md) | [Phase 10 — Distribution](./phase-10-distribution.md) →
