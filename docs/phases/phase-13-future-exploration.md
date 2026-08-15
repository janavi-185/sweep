# Phase 13 — Future Exploration

> **Goal:** Document ideas and advanced concepts to explore only after the core product (Phases 0–12) is solid. These are not requirements. They are opportunities — some practical, some explicitly for learning. Each is assessed honestly.

---

This phase is intentionally different from the others. There are no deliverables checklists. There is no implementation sequence. This is a reference document to return to once StackSweep is feature-complete and you are deciding what, if anything, to build next.

Each idea is assessed across five dimensions:
- **What it is**
- **Why it would be valuable for StackSweep**
- **What problem it solves**
- **Rough implementation approach**
- **What must be true before it makes sense to build**

---

## 1. AI-Powered Storage Explanations

### What it is

An optional layer that uses a language model to explain unrecognised storage consumers in plain English. When StackSweep encounters a path it has no rule for — no entry in `packages/rules`, no known category — instead of showing a raw path, it asks an LLM: "What created this directory? Is it safe to delete?"

Example:

```
/Users/janavi/Library/Application Support/com.superb.unknownapp/Cache/v2/
```

Without AI: StackSweep reports the path and size. No explanation. User is confused.

With AI: "This directory was created by Superb App, a screen recording utility you last opened 8 months ago. It contains a local cache of exported thumbnails. It is safe to delete — the app will recreate it when next launched."

### Why it would be valuable

StackSweep's rule-based engine (packages/rules) only explains what it has a rule for. The long tail of application-specific storage is enormous. An AI layer handles the unknown without requiring a rules update per app.

### What problem it solves

The confidence gap: users who are not developers are reluctant to delete things they do not understand. An explanation in plain English removes that barrier more effectively than a raw path display.

### Implementation approach

**Local model (strongly preferred):** Use [Ollama](https://ollama.ai) to run a small instruction-tuned model locally (e.g., `mistral:7b-instruct` or `llama3.2:3b`). File paths and directory names are queried locally — nothing leaves the machine.

```typescript
// packages/core/src/ai/explain.ts
interface ExplainOptions {
  path: string;
  sizeBytes: number;
  lastModified: Date;
}

export async function explainUnknownPath(opts: ExplainOptions): Promise<string | null> {
  if (!await isOllamaAvailable()) return null;

  const prompt = `
You are a macOS storage expert. A user has a directory at this path:
  ${opts.path}
It is ${formatBytes(opts.sizeBytes)} and was last modified ${opts.lastModified.toDateString()}.

In 2 sentences: what likely created this directory and is it safe to delete?
Answer factually. If uncertain, say so.
`.trim();

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    body: JSON.stringify({ model: "llama3.2:3b", prompt, stream: false }),
  });
  const data = await response.json();
  return data.response ?? null;
}
```

**Privacy rule:** Never send file paths, names, or sizes to any external API without explicit opt-in. Local model inference is the default. If the user wants to use the OpenAI or Anthropic API, they supply their own key and explicitly enable it. The feature must default to local-only.

### What must be true first

- Phases 0–12 are complete and stable
- The rules system (packages/rules) is mature and covers the majority of common cases
- Ollama integration does not add a required dependency — it must be gracefully absent when Ollama is not installed

---

## 2. Plugin / Extension System

### What it is

A mechanism for third-party developers to ship their own cleanup rules and storage detectors as TypeScript modules that StackSweep discovers and loads at runtime.

### Why it would be valuable

The rules system in `packages/rules` can only grow so fast through first-party contributions. A plugin system lets the community contribute detectors for niche tools (specific game engines, scientific software, industry-specific apps) without requiring changes to the core repository.

### What problem it solves

Coverage gaps for apps that StackSweep's maintainers don't personally use or know about.

### Implementation approach

**Plugin discovery:** StackSweep scans `~/.stacksweep/plugins/` at startup for directories containing a `plugin.json` manifest and an `index.ts` (or compiled `index.js`).

**Plugin interface:**

```typescript
// packages/types/src/plugin.ts
export interface CleanupPlugin {
  name: string;
  version: string;
  description: string;

  // Returns candidates found — must not delete anything
  detect(context: ScanContext): Promise<CleanupCandidate[]>;

  // Called when a candidate this plugin returned is about to be deleted
  // Return false to abort (e.g., if a safety check fails at delete time)
  beforeDelete?(candidate: CleanupCandidate): Promise<boolean>;
}
```

**Security constraints:**
- Plugins run in a Node.js worker thread (`worker_threads`) — not a separate process, but isolated from the main event loop
- Plugins receive a `ScanContext` that exposes only `fs.stat`, `fs.readdir`, and `fs.readFile` on paths under `~` — not `exec`, not `spawn`, not network access
- A plugin that attempts to call `exec` or `require("child_process")` is rejected at load time via static analysis
- Plugins are not sandboxed at the OS level (no App Sandbox) — this is a pragmatic limitation. Document it clearly.

### What must be true first

- `packages/rules` API is stable and will not change in breaking ways
- The `CleanupPlugin` interface is finalized — a plugin system built on an unstable interface is worthless
- A public plugin registry or GitHub topic convention exists for discoverability

---

## 3. Scheduled Scans

### What it is

StackSweep runs a scan on a schedule (daily, weekly) without the user opening the app, then delivers a macOS notification summarizing findings.

### Why it would be valuable

Storage accumulates gradually. A user who runs StackSweep once and does not open it again misses the ongoing value. Scheduled scans make StackSweep a persistent background utility rather than a one-time tool.

### What problem it solves

The "I forgot it existed" problem. A weekly summary notification keeps StackSweep relevant and prompts action before storage becomes critical.

### Implementation approach

macOS scheduled background execution is handled via **LaunchAgents** — property list files placed in `~/Library/LaunchAgents/` that `launchd` loads and executes on a schedule.

```bash
# Install a weekly LaunchAgent
stacksweep schedule enable --weekly

# Remove it
stacksweep schedule disable
```

The LaunchAgent plist calls `stacksweep scan --quiet --notify` which runs a headless scan and sends a macOS notification via the `node-notifier` package or a Tauri notification API call.

```xml
<!-- ~/Library/LaunchAgents/com.stacksweep.weekly.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.stacksweep.weekly</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/stacksweep</string>
    <string>scan</string>
    <string>--quiet</string>
    <string>--notify</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>1</integer>  <!-- Monday -->
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

### What must be true first

- The CLI binary is stable and correctly installed in a fixed path (Phase 10 distribution complete)
- The `--notify` flag produces reliable macOS notifications that do not require the app to be open
- The scan is fast enough (< 30 seconds) to run as a background process without noticeable system impact

---

## 4. Watch Mode

### What it is

`stacksweep watch [path]` monitors a directory in real-time using macOS's native FSEvents API. When the directory's total size crosses a configurable threshold, StackSweep sends a macOS notification.

### Why it would be valuable

Some directories grow rapidly and silently: `~/Downloads`, `~/.docker`, `~/Library/Developer/Xcode/DerivedData`. Watch mode acts as an early warning system.

### What problem it solves

Prevents the "where did 40 GB go" moment by alerting the user as directories grow past a threshold, not after the fact.

### Implementation approach

FSEvents is accessible in Node.js via the `fsevents` npm package (macOS-only, native module).

```typescript
// packages/core/src/watch/watcher.ts
import * as fsevents from "fsevents";

export interface WatchOptions {
  path: string;
  thresholdBytes: number;
  onThresholdExceeded: (currentBytes: number) => void;
}

export function startWatch(opts: WatchOptions): () => void {
  let lastNotified = 0;

  const stop = fsevents.watch(opts.path, async (_path, flags) => {
    if (flags & fsevents.constants.kFSEventStreamEventFlagItemModified) {
      const size = await getDirSize(opts.path);
      if (size > opts.thresholdBytes && Date.now() - lastNotified > 3_600_000) {
        lastNotified = Date.now();
        opts.onThresholdExceeded(size);
      }
    }
  });

  return stop;
}
```

### What must be true first

- `fsevents` native module compiles correctly in the target Node.js/Bun version
- The watch process can run as a lightweight daemon without excessive CPU usage (FSEvents is low-cost — this should not be a problem)
- The `schedule` feature (Idea 3) exists so watch mode can use the same LaunchAgent infrastructure

---

## 5. Cross-Platform Support (Linux)

### What it is

Extend StackSweep to run on Linux, specifically for developer workflows on Ubuntu, Fedora, and Arch.

### Why it would be valuable

Most of `packages/core` is already platform-agnostic: file size calculation, duplicate detection, npm/pnpm/yarn cache detection, and Python virtualenv detection all work on Linux without modification. The gap is macOS-specific paths (`~/Library/`, Homebrew on Intel/ARM, etc.) and macOS-only tools (`tmutil`, `system_profiler`).

### What problem it solves

Developer storage waste is not a macOS-exclusive problem. Linux developers accumulate the same npm caches, Docker images, and Rust `target/` directories.

### Implementation approach

1. Introduce a `PlatformResolver` interface in `packages/core`:

```typescript
// packages/core/src/platform/resolver.ts
export interface PlatformResolver {
  cacheDir(): string;         // ~/Library/Caches on macOS, ~/.cache on Linux
  configDir(): string;        // ~/Library/Application Support on macOS, ~/.config on Linux
  npmCachePath(): string;
  pipCachePath(): string;
  brewCellarPath(): string | null;  // null on Linux
}

export function getPlatformResolver(): PlatformResolver {
  if (process.platform === "darwin") return new MacOSResolver();
  if (process.platform === "linux") return new LinuxResolver();
  throw new Error(`Unsupported platform: ${process.platform}`);
}
```

2. Implement `LinuxResolver` with XDG Base Directory paths
3. Disable macOS-specific analyzers (Time Machine, iOS backups, etc.) on Linux — they simply do not run
4. Add Linux to the GitHub Actions CI matrix

### What must be true first

- The macOS version is feature-complete (Phases 0–12)
- The `PlatformResolver` abstraction can be introduced without breaking existing macOS behavior
- At least one Linux user/contributor is willing to test and maintain the Linux path

---

## 6. Homebrew Distribution

### What it is

A Homebrew tap that allows developers on macOS to install StackSweep with `brew install`.

```bash
brew tap yourname/stacksweep
brew install stacksweep
```

### Why it would be valuable

Homebrew is how the target user (macOS developers) installs developer tools. It manages updates automatically via `brew upgrade`. It is more discoverable than a curl-based installer for developers who already rely on Homebrew.

### What problem it solves

The curl installer (Phase 10) requires finding the GitHub Releases page. Homebrew puts StackSweep one command away from any developer who knows it exists.

### Implementation approach

1. Create a GitHub repository `yourname/homebrew-stacksweep`
2. Add a `Formula/stacksweep.rb` that:
   - Downloads the standalone binary from GitHub Releases
   - Verifies the SHA256 checksum
   - Installs it to `#{bin}/stacksweep`
3. Update the formula's `url` and `sha256` on each release via a GitHub Actions workflow

```ruby
# Formula/stacksweep.rb
class Stacksweep < Formula
  desc "macOS storage analyzer and cleanup CLI"
  homepage "https://github.com/yourname/sweep"
  version "1.0.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yourname/sweep/releases/download/v#{version}/stacksweep-darwin-arm64"
      sha256 "..." # updated per release
    else
      url "https://github.com/yourname/sweep/releases/download/v#{version}/stacksweep-darwin-x64"
      sha256 "..."
    end
  end

  def install
    bin.install "stacksweep-darwin-#{Hardware::CPU.arm? ? "arm64" : "x64"}" => "stacksweep"
  end
end
```

### What must be true first

- The standalone binary (Phase 10) is reliably built and published to GitHub Releases on every version tag
- The binary is code-signed so Gatekeeper does not block it (Phase 10 deliverable)
- A version number convention is established and followed consistently

---

## 7. Optional Redis Caching (Learning Exploration)

### What it is

Replace or augment the SQLite scan cache (`packages/database`) with Redis for caching scan results and streaming live scan progress via pub/sub.

### Why it would be (or would not be) valuable for StackSweep

**Honest assessment: Redis is not needed for StackSweep's current use case.** SQLite is the correct choice for a single-user, local CLI tool. It has zero infrastructure overhead, works offline, and is available on every machine without additional setup. Redis adds operational complexity (requires a running server process) with no benefit for this use case.

This idea is valuable **only as a learning exercise.**

### What you would learn

- Redis data structures: strings, sorted sets (for leaderboard-style "largest dirs" queries), hashes (for storing scan metadata)
- Pub/Sub: streaming scan events (`file.found`, `category.classified`, `candidate.detected`) as Redis messages consumed by a subscriber (e.g., the desktop app listening for live updates without polling)
- TTL management: expiring old scan results automatically
- Connection pooling: managing a Redis connection pool in a Node.js server context
- The operational cost of adding a stateful dependency to what was previously a stateless tool

### Rough implementation approach

```typescript
// packages/database/src/redis-adapter.ts (hypothetical)
import { createClient, RedisClientType } from "redis";

export class RedisAdapter implements CacheAdapter {
  private client: RedisClientType;

  async connect() {
    this.client = createClient({ url: "redis://localhost:6379" });
    await this.client.connect();
  }

  async saveScan(scanId: string, result: ScanResult): Promise<void> {
    await this.client.hSet(`scan:${scanId}`, {
      status: result.status,
      totalFiles: result.totalFiles.toString(),
      startedAt: result.startedAt.toISOString(),
    });
    await this.client.expire(`scan:${scanId}`, 604800); // TTL: 7 days
  }

  async publishProgress(scanId: string, progress: ScanProgress): Promise<void> {
    await this.client.publish(`scan:${scanId}:progress`, JSON.stringify(progress));
  }
}
```

### What must be true first

- Phases 0–12 are complete
- The goal is explicitly learning Redis, not solving a StackSweep problem
- This should be built as a parallel implementation alongside SQLite, not as a replacement

---

## 8. Kafka for Event Streaming (Learning Exploration)

### What it is

Stream StackSweep scan events — `file.found`, `category.classified`, `candidate.detected`, `scan.completed` — as Kafka messages. A consumer reads the stream and builds the final scan report.

### Why it would be (or would not be) valuable for StackSweep

**Honest assessment: Kafka is not appropriate for StackSweep.** Kafka is designed for distributed, high-throughput, multi-producer/multi-consumer event systems. StackSweep is a single-user desktop tool. Adding Kafka to StackSweep is architectural theatre — it solves a problem that does not exist in this context.

This idea exists here solely as a documented learning exercise if the goal is understanding distributed event-driven systems.

### What you would learn

- Kafka topics, partitions, consumer groups, and offset management
- The event-driven architecture pattern: producers emit events; consumers build materialized views
- The operational cost of Kafka (Zookeeper or KRaft mode, broker configuration, retention policies)
- When event streaming is the right tool vs. when a simple queue or in-process event emitter suffices
- The contrast with Redis Pub/Sub (Idea 7) — Kafka retains events; pub/sub does not

### Rough implementation concept

```
scanEngine (producer)
    |
    | -> Kafka topic: "stacksweep.scan.events"
    |
    v
reportBuilder (consumer)
    | consumes events, builds ScanResult
    v
database (SQLite or Redis) <- final result stored
```

Events emitted:
```typescript
type ScanEvent =
  | { type: "file.found"; payload: { path: string; sizeBytes: number } }
  | { type: "category.classified"; payload: { path: string; category: string } }
  | { type: "candidate.detected"; payload: CleanupCandidate }
  | { type: "scan.completed"; payload: { scanId: string; totalFiles: number } };
```

### What must be true first

- Phases 0–12 are complete
- The goal is explicitly learning distributed systems architecture, not improving StackSweep
- A local Kafka cluster can be spun up with Docker Compose for development

---

## 9. Docker-Based Development Fixtures

### What it is

A Docker Compose setup that creates a controlled filesystem environment for testing StackSweep against known, reproducible directory structures — rather than running against the developer's own home directory.

### Why it would be valuable

Unit tests mock filesystem calls. Integration tests currently run against real paths. Docker-based fixtures allow integration tests to run against a fixture filesystem that always contains exactly the expected directories, sizes, and file types. Tests become deterministic and environment-independent.

### What problem it solves

"It works on my machine" failures in CI — caused by missing paths, unexpected directory contents, or permissions differences between developer machines and CI runners.

### Implementation approach

```dockerfile
# docker/test-fixture/Dockerfile
FROM ubuntu:22.04

RUN mkdir -p \
  /home/testuser/.npm/_cacache \
  /home/testuser/.cache/pip \
  /home/testuser/projects/app1/node_modules \
  /home/testuser/Library/Application\ Support/MobileSync/Backup/fake-uuid

# Populate with known-size fixture files
COPY fixtures/ /home/testuser/
```

```yaml
# docker-compose.test.yml
services:
  test-runner:
    build: .
    volumes:
      - ./:/workspace
    command: bun test --integration
    environment:
      STACKSWEEP_HOME: /home/testuser
```

### What must be true first

- The integration test suite exists and needs a controlled environment
- The Docker-based fixture does not require macOS APIs (Time Machine, `system_profiler`) — those tests remain unit-mocked

---

## 10. Cloud Sync (Optional, Opt-In)

### What it is

Sync StackSweep's scan history and cleanup audit log across multiple Macs owned by the same user.

### Why it would be valuable

Power users with multiple Macs (work and personal, or desktop and laptop) currently have separate, disconnected histories. Cross-device sync would give a unified view of cleanup actions across all machines.

### What problem it solves

Fragmented history: "Did I already clean up Docker images on my other Mac?"

### Implementation approach

**Primary option: iCloud CloudKit (native macOS, free for users)**
- CloudKit requires an Apple Developer account but is free for the user
- Stores data in the user's own iCloud account — StackSweep never touches the data
- Appropriate for a macOS-native tool

**Alternative: Self-hosted (advanced users)**
- Expose a simple REST API that syncs JSON records
- User runs their own server (or uses a compatible hosted option)
- Suitable for privacy-conscious users who do not want data in iCloud

**Privacy rules (non-negotiable):**
- Opt-in only — disabled by default, requires explicit `stacksweep sync enable` command
- No file paths, file contents, or personally identifying information sync without explicit user consent
- Sync only: scan timestamps, category totals, space reclaimed totals, and deletion counts — not file names or paths

### What must be true first

- The desktop app (Phase 11) exists — cloud sync requires a persistent identity (iCloud account) that the CLI alone cannot assume
- The local SQLite schema is stable and versioned
- A data migration strategy exists for schema changes to the synced records

---

## 11. macOS Menu Bar Agent

### What it is

A persistent, lightweight status bar icon in the macOS menu bar (the strip of icons at the top-right of the screen) that shows current free disk space and allows one-click scan triggering.

### Why it would be valuable

Most users will not open StackSweep proactively. A menu bar icon makes the current disk state visible at a glance and reduces friction for running a scan.

### Behaviour

```
[Menu bar icon: shows % disk free or colored indicator]
  Click to open:
  ┌────────────────────────────┐
  │  💾  58.4 GB free (34%)    │
  │  Last scan: 3 days ago     │
  │                            │
  │  [Run Scan Now]            │
  │  [Open StackSweep]         │
  │  ─────────────────         │
  │  [Quit]                    │
  └────────────────────────────┘
```

Notifications: If free disk drops below a user-configured threshold (default: 10 GB or 15%), a macOS notification fires.

### Implementation approach

Built as an extension of the Tauri desktop app (Phase 11). Tauri v2 supports system tray (`SystemTray`) as a first-class feature. The menu bar agent reuses the sidecar process — no new backend required.

```rust
// src-tauri/src/tray.rs
use tauri::{SystemTray, SystemTrayMenu, CustomMenuItem};

pub fn build_tray() -> SystemTray {
  let quit = CustomMenuItem::new("quit", "Quit");
  let scan = CustomMenuItem::new("scan", "Run Scan Now");
  let open = CustomMenuItem::new("open", "Open StackSweep");
  let menu = SystemTrayMenu::new().add_item(scan).add_item(open).add_native_item(tauri::SystemTrayMenuItem::Separator).add_item(quit);
  SystemTray::new().with_menu(menu)
}
```

### What must be true first

- Phase 11 (desktop app) is complete and stable
- The Tauri sidecar pattern is working reliably — the menu bar agent shares the same sidecar
- The app is properly notarized (Phase 11 deliverable) — the menu bar agent runs persistently and will be subject to the same Gatekeeper scrutiny

---

## Decision Framework

Before building any idea from this phase, apply all four questions. All four should have clear answers.

| Question | What a "yes" looks like |
|---|---|
| **1. Does it solve a real problem that real users have experienced?** | You have user feedback, a GitHub issue, or direct observation of the pain point. Not a hypothetical. |
| **2. Is the core product (Phases 0–12) complete?** | All deliverable checklists in Phases 0–12 are checked off. The CLI and desktop app ship, scan, analyze, and clean correctly. |
| **3. Is the complexity proportional to the value delivered?** | The feature delivers meaningful improvement for the effort required. A feature that takes 3 weeks to build and saves users 30 seconds is not proportional. |
| **4. Is this primarily a learning exercise?** | If yes — that is a completely valid reason to build it. But name it honestly. Do not rationalize a learning exercise as a product requirement. Build it in a branch or separate package. Document what you learned. |

Ideas 7 (Redis) and 8 (Kafka) are explicitly learning exercises. If you build them, do so in a `learning/` or `experiments/` directory and document the learnings, not just the code.

Ideas 1–6, 9–11 have genuine product value — but only once the core product is done. The worst outcome for StackSweep is spending time on future exploration while Phases 0–12 have unfinished work.

---

← [Phase 12](./phase-12-advanced-macos.md)
