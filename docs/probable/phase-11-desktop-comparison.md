# Phase 11 — Desktop Framework Decision: Electron vs Tauri

> **Purpose:** A side-by-side architectural comparison of Electron and Tauri for StackSweep.
> Read this before starting Phase 11. Choose one framework and commit to it.

---

## The Core Question

Both options produce a native macOS desktop app with a React + TypeScript frontend.
The difference is **what runs underneath** and **how big the output is**.

---

## At a Glance

| | Electron | Tauri v2 |
|---|---|---|
| Frontend | React + TypeScript | React + TypeScript |
| Backend language | Node.js (TypeScript) | Rust |
| Bundled runtime | Chromium + Node.js | None (uses system WebView) |
| Download size | ~85–120 MB | ~8–15 MB |
| Installed size | ~180–250 MB | ~15–25 MB |
| macOS WebView | Chromium (bundled) | WKWebView (system) |
| Learning curve | Low (you know JS/TS) | Medium (Rust for native layer) |
| Setup complexity | Simple | Moderate |
| Maturity | Very mature (2013) | Modern, stable (v2: 2024) |
| Memory usage | ~200–400 MB | ~30–80 MB |
| Startup time | ~2–4 seconds | ~0.5–1 second |

---

## Option A — Electron Architecture

### How it works

Electron ships your entire app as a self-contained bundle:
Chromium browser engine + Node.js runtime + your code, all in one `.app`.

```
StackSweep.app  (~200 MB installed)
│
├── Electron Framework          ← Chromium + Node.js runtime (~150 MB)
│
├── Main Process (Node.js)      ← Runs as a privileged Node.js process
│   ├── main.ts                 ← App entry point, window management
│   ├── ipc-handlers.ts         ← Handles calls from the renderer
│   └── @stacksweep/core        ← Your core engine runs HERE (Node.js)
│
└── Renderer Process (Chromium) ← Your React UI runs in a browser tab
    ├── App.tsx
    ├── pages/
    └── components/
```

### IPC Communication (Main ↔ Renderer)

```
React UI (Renderer)
      │
      │  window.electronAPI.scan(path)   ← contextBridge exposed API
      ▼
Electron IPC (ipcRenderer.invoke)
      │
      ▼
Main Process (ipcMain.handle)
      │
      ▼
packages/core → scanDirectory(path)
      │
      ▼
Result sent back via IPC → React updates UI
```

### Full folder structure

```
apps/desktop/
├── electron/
│   ├── main.ts                 ← BrowserWindow, app lifecycle
│   ├── preload.ts              ← contextBridge: expose safe APIs to renderer
│   └── ipc/
│       ├── scan.handler.ts
│       ├── clean.handler.ts
│       ├── analyze.handler.ts
│       └── index.ts
│
├── src/                        ← React frontend (identical to Tauri option)
│   ├── App.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Scan.tsx
│   │   ├── Analyze.tsx
│   │   ├── Clean.tsx
│   │   ├── Developer.tsx
│   │   ├── Duplicates.tsx
│   │   ├── History.tsx
│   │   └── Settings.tsx
│   ├── components/
│   ├── hooks/
│   └── main.tsx
│
├── package.json
├── vite.config.ts              ← Vite bundles the React side
└── electron-builder.config.ts  ← Builds the final .dmg / .app
```

### Key packages

```json
{
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.0.0",
    "vite-plugin-electron": "^0.28.0"
  },
  "dependencies": {
    "@stacksweep/core": "workspace:*",
    "@stacksweep/database": "workspace:*"
  }
}
```

### Build output

```bash
pnpm build:desktop

# Output:
dist/
├── StackSweep-0.1.0-arm64.dmg     ← ~100 MB download
├── StackSweep-0.1.0-arm64-mac.zip ← For auto-updater
└── mac-arm64/
    └── StackSweep.app              ← ~200 MB installed
```

### Pros
- ✅ You already know Node.js and TypeScript — zero new language to learn
- ✅ `packages/core` runs directly in the main process — no IPC serialisation for complex data
- ✅ Massive ecosystem, Stack Overflow answers for everything
- ✅ `electron-builder` handles code signing, notarization, auto-updates out of the box
- ✅ Same Node.js APIs you use in the CLI — `fs`, `path`, `crypto` all work identically

### Cons
- ❌ ~200 MB installed — ironic for a storage cleaner
- ❌ High memory usage (~200–400 MB RAM idle)
- ❌ Slow startup (Chromium cold start)
- ❌ Two processes always running (main + renderer)

---

## Option B — Tauri v2 Architecture

### How it works

Tauri uses the **operating system's built-in WebView** (WKWebView on macOS) instead of bundling Chromium.
The native shell is written in Rust — but it's kept minimal.
Your core engine (TypeScript) runs as a **sidecar** process.

```
StackSweep.app  (~20 MB installed)
│
├── Tauri Runtime (Rust)        ← Tiny native shell (~5 MB)
│   ├── Window management
│   ├── macOS menu bar, tray
│   ├── IPC bridge
│   └── Sidecar process manager
│
├── WKWebView                   ← macOS system WebView (NOT bundled)
│   └── React UI runs here
│
└── Sidecar: stacksweep-core    ← Your TypeScript core engine
    ├── packages/core
    ├── packages/database
    └── JSON-RPC server on localhost
```

### IPC Communication (React ↔ Rust ↔ Sidecar)

```
React UI
      │
      │  invoke('scan', { path })     ← Tauri's invoke() API
      ▼
Tauri Rust Command (#[tauri::command])
      │
      │  HTTP request to sidecar
      ▼
Sidecar (Node.js / Bun server)
      │
      ▼
packages/core → scanDirectory(path)
      │
      ▼
JSON response → Rust → invoke resolves → React updates UI
```

### The Sidecar Pattern

Because Tauri's native layer is Rust, to keep your core engine in TypeScript you run it as a **sidecar** — a child process that Tauri manages.

```
apps/desktop/
├── sidecar/
│   ├── server.ts           ← JSON-RPC 2.0 HTTP server (express or Bun.serve)
│   ├── handlers/
│   │   ├── scan.ts         ← calls packages/core
│   │   ├── analyze.ts
│   │   ├── clean.ts
│   │   └── history.ts
│   └── package.json
```

The sidecar is compiled to a standalone binary (via `bun build --compile`) and bundled inside the `.app`. Tauri starts and stops it automatically.

### Full folder structure

```
apps/desktop/
├── src-tauri/                  ← Rust (keep this minimal)
│   ├── src/
│   │   ├── main.rs             ← Tauri app entry
│   │   ├── lib.rs
│   │   └── commands.rs         ← Tauri commands (thin proxies to sidecar)
│   ├── Cargo.toml
│   ├── tauri.conf.json         ← App config, sidecar declaration
│   ├── capabilities/           ← Fine-grained permission system (Tauri v2)
│   └── icons/
│
├── sidecar/                    ← TypeScript JSON-RPC server
│   ├── server.ts
│   └── handlers/
│
├── src/                        ← React frontend (identical to Electron option)
│   ├── App.tsx
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   └── main.tsx
│
├── package.json
└── vite.config.ts
```

### Key packages

```json
{
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0"
  }
}
```

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = ["shell-sidecar"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Build output

```bash
pnpm tauri build

# Output:
src-tauri/target/release/bundle/
├── dmg/
│   └── StackSweep_0.1.0_aarch64.dmg   ← ~12 MB download
└── macos/
    └── StackSweep.app                  ← ~20 MB installed
```

### Pros
- ✅ ~20 MB installed — appropriate for a storage cleaner
- ✅ Low memory usage (~30–80 MB RAM idle)
- ✅ Fast startup (~0.5s)
- ✅ Core engine stays in TypeScript via sidecar — no Rust business logic
- ✅ WKWebView is the same engine Safari uses — fast, native feel
- ✅ Tauri v2 has a fine-grained permission system (better security)

### Cons
- ⚠️ Rust required for the native shell (small amount, but a new language)
- ⚠️ Sidecar adds architectural complexity (two processes to manage)
- ⚠️ WKWebView rendering may differ slightly from Chromium (minor CSS issues)
- ⚠️ Smaller ecosystem than Electron (but growing fast)

---

## Side-by-Side Architecture Diagram

```
ELECTRON                              TAURI v2
────────────────────────────          ────────────────────────────

  ┌─────────────────────┐               ┌─────────────────────┐
  │   StackSweep.app    │               │   StackSweep.app    │
  │     (~200 MB)       │               │     (~20 MB)        │
  │                     │               │                     │
  │  ┌───────────────┐  │               │  ┌───────────────┐  │
  │  │  Main Process │  │               │  │  Tauri (Rust) │  │
  │  │  (Node.js)    │  │               │  │  Native Shell │  │
  │  │               │  │               │  └───────┬───────┘  │
  │  │  packages/    │  │               │          │ spawns   │
  │  │  core ✓       │  │               │  ┌───────▼───────┐  │
  │  └───────┬───────┘  │               │  │   Sidecar     │  │
  │  ipcMain │          │               │  │  (Node.js /   │  │
  │          │ IPC      │               │  │   Bun binary) │  │
  │  ┌───────▼───────┐  │               │  │               │  │
  │  │   Renderer    │  │               │  │  packages/    │  │
  │  │  (Chromium)   │  │               │  │  core ✓       │  │
  │  │  [bundled]    │  │               │  └───────┬───────┘  │
  │  │               │  │               │  JSON-RPC│          │
  │  │  React UI     │  │               │  ┌───────▼───────┐  │
  │  └───────────────┘  │               │  │  WKWebView    │  │
  │                     │               │  │  [system]     │  │
  └─────────────────────┘               │  │               │  │
                                        │  │  React UI     │  │
                                        │  └───────────────┘  │
                                        │                     │
                                        └─────────────────────┘
```

---

## Data Flow Comparison

### Electron: scan command

```
User clicks "Scan"
      │
React: window.electronAPI.scan('~/Downloads')
      │
preload.ts contextBridge → ipcRenderer.invoke('scan', path)
      │
main.ts ipcMain.handle('scan') → core.scanDirectory(path)
      │
ScanResult returned via IPC (serialised to JSON automatically)
      │
React receives result → renders report
```

### Tauri: scan command

```
User clicks "Scan"
      │
React: invoke('scan', { path: '~/Downloads' })
      │
Tauri Rust command: scan(path) → HTTP POST to sidecar localhost:PORT
      │
Sidecar handler: core.scanDirectory(path)
      │
ScanResult → JSON response → Rust → invoke resolves
      │
React receives result → renders report
```

---

## The Irony Factor

```
StackSweep's job:     Help users reclaim disk space
Electron install size: ~200 MB
Tauri install size:    ~20 MB

A user installs StackSweep, cleans 5 GB,
but the tool itself consumed 200 MB of the space they were trying to free.
```

This is not a blocker — VS Code (Electron, ~400 MB) is beloved.
But it is worth knowing.

---

## Recommended Path Given Your Situation

```
You already know: TypeScript, JavaScript, Node.js
You do NOT know: Rust

                    ┌─────────────────────┐
                    │  Start with Electron │
                    │  (zero new language) │
                    └──────────┬──────────┘
                               │
                    Get the UI working
                    Learn the patterns
                               │
                    ┌──────────▼──────────┐
                    │  Migrate to Tauri   │
                    │  when you're ready  │
                    │  to learn Rust      │
                    └─────────────────────┘
```

**Or:** Use **Tauri + sidecar** from the start. The Rust code in `src-tauri/` is minimal (~50 lines) — it's just a thin proxy. Your actual logic stays TypeScript. This is the best of both worlds if you can tolerate a short Rust learning curve.

---

## Final Decision Checklist

Before starting Phase 11, answer these:

- [ ] **Do I want to learn Rust?** → Yes → Tauri. No → Electron.
- [ ] **Does app size matter to me?** → Yes (it should, given the product) → Tauri.
- [ ] **Do I want fast startup?** → Yes → Tauri.
- [ ] **Do I want the simplest possible setup first?** → Yes → Electron.
- [ ] **Am I comfortable with a sidecar process?** → Yes → Tauri is viable.

---

*Previous: [Phase 11 — Desktop Application](./phase-11-desktop-app.md)*
*Master index: [All Phases](./PHASES.md)*
