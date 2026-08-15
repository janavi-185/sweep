# Sweep — Development Phases

> A complete, sequenced roadmap. Every phase builds on the last.
> No phase is skipped. Advanced concepts appear only when the foundation is ready.

---

## Core Principle

> **Build the simple version first. Add complexity only when there is a reason for it.**
> The CLI will never silently delete anything. Every destructive action requires explicit user confirmation.

---

## All Phases at a Glance

- **[Phase 0 — Architecture & Project Foundation](./phase-0-architecture.md)**
  Set up the monorepo, TypeScript, pnpm workspaces, GitHub Actions CI, and folder structure before writing a single line of application logic.

- **[Phase 1 — CLI Foundation](./phase-1-cli-foundation.md)**
  Bootstrap a working CLI binary using Commander.js with `--help`, `--version`, and placeholder command stubs. Users can run `sweep` from their terminal.

- **[Phase 2 — Filesystem Scanner](./phase-2-filesystem-scanner.md)**
  Implement recursive directory traversal, file metadata collection, size calculation, and category classification. No UI yet — just accurate data.

- **[Phase 3 — Storage Analyzer & Reporting](./phase-3-storage-analyzer.md)**
  Build human-readable terminal reports: largest files, largest directories, storage breakdown by category. Everything is read-only at this stage.

- **[Phase 4 — Developer Storage Detection](./phase-4-developer-storage.md)**
  Identify developer-specific storage consumers: Xcode DerivedData, Docker data, npm/pnpm/yarn caches, Gradle, Android SDK, Python envs, Homebrew. Report sizes — no deletion yet.

- **[Phase 5 — Safe Cleanup Engine](./phase-5-safe-cleanup.md)**
  Build the cleanup engine with a strict permission-first model. The CLI identifies candidates, explains what each item is and why it is safe to remove, and asks for explicit user confirmation. Nothing is ever deleted silently.

- **[Phase 6 — Duplicate File Finder](./phase-6-duplicate-finder.md)**
  Find duplicate files using a two-pass approach: pre-filter by size, then confirm with SHA-256 hashing. Report duplicates and let the user decide what to do.

- **[Phase 7 — SQLite Persistence](./phase-7-sqlite-persistence.md)**
  Introduce SQLite for structured persistence: scan history, cleanup history, user settings, and safety rules. Use flat JSON for user-facing config files.

- **[Phase 8 — Caching & Incremental Scanning](./phase-8-caching.md)**
  Add a TTL-based scan cache backed by SQLite. Implement cache invalidation strategies and incremental scanning so repeated scans are fast.

- **[Phase 9 — Concurrency & Performance](./phase-9-concurrency.md)**
  Parallelise directory traversal using worker threads or async concurrency. Benchmark, profile, and optimize the core engine. Handle edge cases: symlinks, permissions, network volumes.

- **[Phase 10 — Distribution: curl Installer & Binary](./phase-10-distribution.md)**
  Compile the CLI to a standalone binary (no Node.js required for end users). Build GitHub Actions release pipeline. Ship a `curl` one-line installer. Support macOS arm64 and x64.

- **[Phase 11 — Desktop Application (Tauri)](./phase-11-desktop-app.md)**
  Build a native macOS desktop GUI using Tauri v2 + React. The desktop app shares the same core engine as the CLI. Add visual charts, interactive cleanup flows, and a settings panel.

- **[Phase 12 — Advanced macOS Analysis](./phase-12-advanced-macos.md)**
  Deep analysis of macOS-specific storage: System Data breakdown, Time Machine snapshots, iOS device backups, hidden caches, Mail attachments, and iCloud Drive.

- **[Phase 13 — Future Exploration](../probable/phase-13-future-exploration.md)**
  AI-powered suggestions, plugin architecture, scheduled scans, optional cloud sync, cross-platform support, Homebrew tap, and other advanced ideas.

- **[Future Enhancements & Customizations](../probable/future-enhancements.md)**
  First-time developer onboarding (username entry), pluggable CLI color themes (`nord`, `dracula`, `emerald`, `amber`, `monochrome`), and experiential backlog.

---

## Dependency Chain

```
Phase 0 (Foundation)
    │
    ▼
Phase 1 (CLI binary)
    │
    ▼
Phase 2 (Scanner)
    │
    ▼
Phase 3 (Analyzer & Reports)
    │
    ├──▶ Phase 4 (Developer Storage)
    │
    ▼
Phase 5 (Safe Cleanup Engine)
    │
    ├──▶ Phase 6 (Duplicate Finder)
    │
    ▼
Phase 7 (SQLite Persistence)
    │
    ▼
Phase 8 (Caching)
    │
    ▼
Phase 9 (Concurrency & Performance)
    │
    ▼
Phase 10 (Distribution — curl installer)
    │
    ▼
Phase 11 (Desktop App)
    │
    ├──▶ Phase 12 (Advanced macOS Analysis)
    │
    ▼
Phase 13 (Future Exploration)
    │
    ▼
Future Enhancements (Onboarding, Themes, Backlog)
```

---

## MVP Definition

> **MVP = Phase 0 through Phase 5**
>
> A user can: install via curl → scan a directory → see a detailed report → be shown cleanup candidates with explanations → confirm or decline each one → see what was removed.
