# Phase 11 — Desktop Application (Tauri v2 + React)

> **Goal:** Build a native macOS desktop GUI that shares the same core engine as the CLI — no duplication of business logic, same analysis quality, same safety philosophy.

---

## Objectives

- Ship a native macOS `.dmg` application backed by the same `packages/core` engine that powers the CLI
- Keep all business logic in TypeScript — the Rust layer is purely a shell
- Implement the Tauri sidecar pattern so the React frontend communicates with a local Bun process running the core engine
- Reproduce all CLI analysis capabilities in a visual interface with charts, tables, and confirmation flows
- Enforce the same safety contract as the CLI: no deletion without explicit per-item user confirmation
- Distribute via GitHub Releases as a signed and notarized `.dmg`

---

## Why Tauri v2

Tauri was chosen over Electron for a specific set of technical reasons. This section documents the rationale so future contributors understand the constraint.

### The Electron Problem

Electron ships a full copy of Chromium (~150 MB) inside every application bundle. For a storage analysis tool that users install specifically because they care about disk space, this is a poor fit. A StackSweep Electron build would be roughly 200–250 MB on disk.

### How Tauri Is Different

| Concern | Electron | Tauri v2 |
|---|---|---|
| WebView source | Bundled Chromium (~150 MB) | macOS system WKWebView (0 MB overhead) |
| Backend language | Node.js (JS) | Rust |
| Typical app size | 200–250 MB | 10–20 MB |
| Cold start time | ~2–4s | ~0.3–0.8s |
| Memory usage (idle) | ~180 MB | ~40–60 MB |
| macOS native feel | Limited | Near-native via WKWebView |

> [!NOTE]
> WKWebView is the same engine that powers Safari. It is maintained by Apple and ships with the OS. StackSweep does not pay a size or memory cost for it.

### Why Rust Is Kept Minimal

Tauri v2's Rust layer handles window management, IPC dispatch, OS integration (menu bar, file dialogs, entitlements), and process lifecycle. **It does not contain any StackSweep business logic.** All scan logic, rule evaluation, database access, and candidate detection remain in `packages/core`. This is enforced by the sidecar architecture described below.

The Rust code in `src-tauri/` should remain under ~500 lines of application-specific logic (excluding generated boilerplate). If significant logic starts accumulating there, that is a signal that the sidecar boundary is being violated.

---

## Architecture: Tauri Sidecar Pattern

```
+-----------------------------------------------------------------+
|  macOS Process: StackSweep.app                                  |
|                                                                 |
|  +-------------------------+   Tauri IPC (invoke)              |
|  |  Tauri Shell (Rust)     |<--------------------+             |
|  |  - Window manager       |                     |             |
|  |  - Menu bar             |  +------------------+----------+  |
|  |  - Entitlements         |  |  React Frontend (WKWebView) |  |
|  |  - Sidecar lifecycle    |  |  - UI components            |  |
|  +----------+--------------+  |  - TanStack Query           |  |
|             | spawns          |  - No business logic         |  |
|             v                 +-----------------------------+   |
|  +---------------------------+                                  |
|  |  Sidecar Process (Bun)    |                                  |
|  |  sidecar/server.ts        |                                  |
|  |                           |                                  |
|  |  JSON-RPC 2.0 over        |                                  |
|  |  localhost TCP            |                                  |
|  |                           |                                  |
|  |  Uses: packages/core      |                                  |
|  |        packages/rules     |                                  |
|  |        packages/database  |                                  |
|  |        packages/types     |                                  |
|  +---------------------------+                                  |
+-----------------------------------------------------------------+
```

### Sidecar Communication Protocol

The sidecar exposes a **JSON-RPC 2.0** interface over a local TCP socket (127.0.0.1 on a randomly assigned port). The port is passed to the Tauri shell on startup via stdout, and Tauri then passes it to the React frontend via a Tauri command.

This approach was chosen over stdio IPC because React Query's `queryFn` expects a fetch-compatible interface. A local HTTP/JSON-RPC server integrates cleanly without a custom transport adapter.

```typescript
// sidecar/server.ts — entrypoint
import { createServer } from "http";
import { dispatch } from "./rpc/dispatcher";

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

const server = createServer(async (req, res) => {
  const body = await readBody(req);
  const request = JSON.parse(body);
  const response = await dispatch(request);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response));
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address() as { port: number };
  // Tauri reads this line from sidecar stdout
  process.stdout.write(`SIDECAR_PORT=${port}\n`);
});
```

```typescript
// sidecar/rpc/dispatcher.ts
import {
  startScan, getScanResults, getScanProgress, cancelScan,
  listCandidates, deleteCandidate, listScanHistory,
  getConfig, setConfig,
} from "@stacksweep/core";
import type { JsonRpcRequest, JsonRpcResponse } from "@stacksweep/types";

const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
  "scan.start":        (p) => startScan(p as ScanOptions),
  "scan.results":      (p) => getScanResults(p as { scanId: string }),
  "scan.progress":     (p) => getScanProgress(p as { scanId: string }),
  "scan.cancel":       (p) => cancelScan(p as { scanId: string }),
  "candidates.list":   (p) => listCandidates(p as { scanId: string }),
  "candidates.delete": (p) => deleteCandidate(p as DeleteParams),
  "history.list":      ()  => listScanHistory(),
  "config.get":        ()  => getConfig(),
  "config.set":        (p) => setConfig(p as Partial<Config>),
};

export async function dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const handler = handlers[req.method];
  if (!handler) {
    return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } };
  }
  try {
    const result = await handler(req.params);
    return { jsonrpc: "2.0", id: req.id, result };
  } catch (err) {
    return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: (err as Error).message } };
  }
}
```

### Tauri Sidecar Configuration

```json
// src-tauri/tauri.conf.json (relevant excerpt)
{
  "bundle": {
    "externalBin": ["sidecar/stacksweep-core"]
  },
  "security": {
    "capabilities": {
      "permissions": ["core:sidecar-allow-all"]
    }
  }
}
```

The sidecar binary is compiled with `bun build --compile sidecar/server.ts --outfile sidecar/stacksweep-core` and bundled into the `.app` by Tauri's external binary mechanism. Tauri code-signs the sidecar binary as part of the notarization pipeline.

---

## Directory Structure

```
apps/desktop/
├── src-tauri/                    # Rust Tauri shell (keep minimal)
│   ├── src/
│   │   ├── main.rs               # App entry, sidecar spawn, port handoff
│   │   ├── commands.rs           # Tauri IPC commands exposed to React
│   │   └── menu.rs               # macOS native application menu
│   ├── icons/                    # All required icon sizes
│   ├── entitlements.plist        # macOS entitlements
│   ├── Info.plist                # CFBundleIdentifier, version, etc.
│   └── tauri.conf.json
│
├── src/                          # React frontend
│   ├── components/
│   │   ├── ui/                   # Button, Card, Badge, Badge, Spinner
│   │   ├── layout/               # Sidebar, TopBar, PageLayout
│   │   ├── charts/               # DiskUsageDonut, CategoryBar (Recharts)
│   │   ├── ConfirmationCard.tsx  # Per-item confirm/skip — the core safety UI
│   │   ├── ScanProgress.tsx      # Animated progress + phase label
│   │   └── CategoryBreakdown.tsx # Category size chips
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Scan.tsx
│   │   ├── Analyze.tsx
│   │   ├── Clean.tsx
│   │   ├── Developer.tsx
│   │   ├── Duplicates.tsx
│   │   ├── History.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   │   ├── useScan.ts            # TanStack Query wrapper for scan lifecycle
│   │   ├── useCandidates.ts
│   │   ├── useHistory.ts
│   │   └── useSidecar.ts         # Connection state, port from Tauri command
│   ├── lib/
│   │   ├── rpc.ts                # JSON-RPC 2.0 fetch client
│   │   └── queryClient.ts        # TanStack Query client configuration
│   ├── App.tsx                   # Router setup
│   └── main.tsx
│
├── sidecar/
│   ├── server.ts
│   ├── rpc/dispatcher.ts
│   └── package.json
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## React Tech Stack

| Library | Version | Role |
|---|---|---|
| React | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Dev server + bundler |
| TanStack Query | 5.x | Data fetching, caching, loading/error states |
| React Router | 6.x | Client-side routing |
| Recharts | 2.x | Disk usage and category charts |
| Tailwind CSS | 3.x | Utility-first styling |
| Lucide React | latest | Icon set |
| Zustand | 4.x | UI-only global state (active scan ID, modal state) |

> [!TIP]
> Keep TanStack Query as the single source of truth for all server state. Zustand holds only UI state with no server counterpart — active sidebar tab, modal open/close, sidecar port number. Never copy server data into Zustand.

---

## UI Screens

### 1. Dashboard

**Purpose:** Entry point. Shows disk health at a glance.

**Data required:**
- Total disk size, used, free (via sidecar `os` module)
- Last scan: timestamp, total candidates found, total space identified
- CTA buttons: "Start New Scan", "View Last Results"

**Key component:** Large Recharts `PieChart` (donut) showing used vs. free, broken into categories if a prior scan exists.

**Empty state:** No prior scan → single "Run First Scan" button with a one-sentence explainer. Do not show an empty chart.

---

### 2. Scan View

**Purpose:** Trigger a scan and observe live progress.

**Behaviour:**
1. "Start Scan" → calls `scan.start`, receives `scanId`
2. `scan.progress` polled every 500ms via `refetchInterval`
3. Progress bar shows phase name + files-processed count
4. On `status: "complete"` → navigate to `/analyze/:scanId`

**Key components:** `ScanProgress.tsx` (progress bar + phase label), Cancel button (calls `scan.cancel`, navigates to Dashboard).

> [!IMPORTANT]
> The React frontend never accesses the filesystem. All I/O is mediated by the sidecar → `packages/core` path. This is a permanent architectural constraint.

---

### 3. Analyze View

**Purpose:** Visual breakdown of scan findings.

- Horizontal Recharts `BarChart` of categories sorted by size descending
- Sortable largest-files table: path, size, category, last-accessed date
- "Send to Clean" per category row → navigates to `/clean?category=<name>`

---

### 4. Clean View

**Purpose:** Per-item review and deletion confirmation.

**Safety contract:**
- Each candidate renders as a `ConfirmationCard` with: label, full path (monospace), size, plain-English explanation, and exactly two buttons — `Confirm Delete` and `Skip`
- **No "Delete All" button exists anywhere in the application.** This is a permanent product decision.
- Confirmed items are queued in React state. "Apply N deletions" at the bottom executes them sequentially via `candidates.delete`, displaying inline success/failure per item.

```typescript
// src/components/ConfirmationCard.tsx
interface Props {
  candidate: CleanupCandidate;
  onConfirm: (id: string) => void;
  onSkip: (id: string) => void;
}

export function ConfirmationCard({ candidate, onConfirm, onSkip }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium text-sm">{candidate.label}</p>
          <p className="text-xs text-gray-500 font-mono">{candidate.path}</p>
        </div>
        <span className="text-sm font-semibold text-orange-600">
          {formatBytes(candidate.size)}
        </span>
      </div>
      <p className="text-sm text-gray-600">{candidate.explanation}</p>
      <div className="flex gap-2">
        <button onClick={() => onConfirm(candidate.id)} className="btn-primary">
          Confirm Delete
        </button>
        <button onClick={() => onSkip(candidate.id)} className="btn-ghost">
          Skip
        </button>
      </div>
    </div>
  );
}
```

---

### 5. Developer View

**Purpose:** Developer storage breakdown mirroring `stacksweep dev`.

- **Node.js:** `node_modules` totals across all projects, npm/pnpm/yarn global caches
- **Python:** virtualenvs, pip cache, `.tox` dirs
- **Homebrew:** cellar total, formulae unused for 90+ days
- **Docker:** images, volumes, build cache (via `docker system df`)
- **Rust:** `~/.cargo/registry`, `target/` dirs across Rust projects

---

### 6. Duplicates View

**Purpose:** Manage duplicate file groups.

- Each group is a collapsible card listing paths sharing an identical content hash
- Radio buttons: select which copy to **keep**; all others become candidates
- UI invariant: at least one copy per group must always be selected to keep — enforced in component state, not just visually

---

### 7. History View

**Purpose:** Read-only audit trail of past scans and cleanups.

- Source: `packages/database` via `history.list` RPC
- Columns: Date/time, files scanned, candidates found, space reclaimed, scan duration
- Row click → read-only scan detail view; no deletion actions available from history

---

### 8. Settings View

**Purpose:** Config editor and system status panel.

- Exclusion paths: add/remove with inline path input + validation
- Minimum duplicate file size: number input with byte-unit selector
- Database path: read-only display
- **FDA status:** green badge (granted) or red warning with "Grant Access" button deep-linking to `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`

---

## macOS-Specific Integration

### Application Menu (Rust)

```
StackSweep   |   Scan              |   Help
  About            New Scan              GitHub Repository
  Quit             View Last Results
```

Defined in `src-tauri/src/menu.rs`. Menu items emit Tauri events consumed by the React frontend.

### Filesystem Entitlements

```xml
<!-- src-tauri/entitlements.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

> [!WARNING]
> Full Disk Access cannot be declared in `entitlements.plist`. It must be granted manually by the user. Probe at startup by attempting to list a protected path (e.g., `~/Library/Mail/`). If `EACCES` is returned, surface a persistent FDA banner in Settings. Do not crash or show a modal — let the user continue with limited functionality.

### Code Signing and Notarization

Required for Gatekeeper to allow installation on end-user machines.

1. Obtain **Apple Developer ID Application** certificate from the Developer portal
2. Export as `.p12`, base64-encode, store as `APPLE_CERTIFICATE` GitHub secret
3. Also set: `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID`
4. `tauri-apps/tauri-action` handles signing, notarization submission, stapling, and `.dmg` creation

```yaml
# .github/workflows/desktop-release.yml (excerpt)
- name: Build, sign, and notarize
  uses: tauri-apps/tauri-action@v0
  env:
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  with:
    tagName: v__VERSION__
    releaseName: "StackSweep v__VERSION__"
    releaseDraft: true
```

### App Icon

```bash
# Generate all required icon sizes from a single 1024x1024 source
npx @tauri-apps/cli icon ./assets/icon-source-1024.png
# Output: src-tauri/icons/{32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico}
```

---

## Distribution

| Asset | Details |
|---|---|
| Apple Silicon `.dmg` | `src-tauri/target/release/bundle/dmg/StackSweep_<ver>_aarch64.dmg` |
| Universal binary | Add `--target universal-apple-darwin` to Tauri build flags |
| GitHub Release | Uploaded automatically by CI on `v*` tag push |
| Auto-update | Tauri updater checks GitHub Releases JSON feed on app launch |

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Sidecar binary not found | Startup error dialog with diagnostic path; "Report Issue" link to GitHub |
| `SIDECAR_PORT` not received within 5 seconds | Timeout: startup failure dialog; error appended to `~/Library/Logs/StackSweep/startup.log` |
| RPC call fails mid-cleanup | Per-item error badge inline on ConfirmationCard; remaining queue unaffected |
| FDA not granted | Sidecar returns `{ code: -32001, message: "FDA_REQUIRED" }`; displayed as inline warning in the affected view |
| Window closed during active scan | Sidecar continues; results persisted to SQLite; app reopens to History with completed scan |
| macOS < 13 | WKWebView compatibility checked at launch; minimum version warning shown if unmet |

---

## Unit Tests

```typescript
// src/components/__tests__/ConfirmationCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmationCard } from "../ConfirmationCard";

const candidate: CleanupCandidate = {
  id: "c1",
  label: "npm cache",
  path: "/Users/janavi/.npm/_cacache",
  size: 524288000,
  explanation: "Global npm cache. Safe to delete; npm rebuilds it on next install.",
};

it("renders label and formatted size", () => {
  render(<ConfirmationCard candidate={candidate} onConfirm={vi.fn()} onSkip={vi.fn()} />);
  expect(screen.getByText("npm cache")).toBeInTheDocument();
  expect(screen.getByText("500 MB")).toBeInTheDocument();
});

it("invokes onConfirm with the candidate id", () => {
  const onConfirm = vi.fn();
  render(<ConfirmationCard candidate={candidate} onConfirm={onConfirm} onSkip={vi.fn()} />);
  fireEvent.click(screen.getByText("Confirm Delete"));
  expect(onConfirm).toHaveBeenCalledWith("c1");
});

it("invokes onSkip with the candidate id", () => {
  const onSkip = vi.fn();
  render(<ConfirmationCard candidate={candidate} onConfirm={vi.fn()} onSkip={onSkip} />);
  fireEvent.click(screen.getByText("Skip"));
  expect(onSkip).toHaveBeenCalledWith("c1");
});

it("contains no Delete All affordance", () => {
  render(<ConfirmationCard candidate={candidate} onConfirm={vi.fn()} onSkip={vi.fn()} />);
  expect(screen.queryByText(/delete all/i)).not.toBeInTheDocument();
});
```

**Additional required coverage:**

- `useScan`: mock RPC client with `vi.mock("../lib/rpc")`; assert loading → success → data transitions
- `Dashboard`: empty state when `history.list` returns `[]`; chart renders with mock data
- `Duplicates`: assert state machine prevents all copies in a group being marked for deletion
- `ScanProgress`: assert displayed percentage updates across re-renders with different `progress` props
- `rpc.ts`: assert `Content-Type: application/json` header sent; assert `JsonRpcError` thrown on non-200

---

## Deliverables

- [ ] `apps/desktop/` scaffolded with Tauri v2 + React 18 + Vite + TypeScript
- [ ] Sidecar server: JSON-RPC 2.0 over localhost TCP, port announced via `SIDECAR_PORT=<n>` on stdout
- [ ] Sidecar dispatcher: all RPC methods wired to `packages/core` functions
- [ ] Tauri Rust shell: sidecar spawn, port handoff via Tauri command, window setup
- [ ] All 8 UI pages implemented, routed via React Router, data-fetched via TanStack Query
- [ ] `ConfirmationCard.tsx` with zero "Delete All" affordance
- [ ] 500ms live scan progress polling via `refetchInterval`
- [ ] Recharts disk usage donut chart + category bar chart
- [ ] macOS native application menu in Rust
- [ ] `entitlements.plist` configured; FDA probe at startup
- [ ] Settings page: FDA status badge + System Settings deep-link
- [ ] App icon generated at all required sizes from 1024×1024 source PNG
- [ ] GitHub Actions: build, sign, notarize, upload `.dmg` on `v*` tag
- [ ] Universal binary (`universal-apple-darwin`) build target configured
- [ ] Vitest + `@testing-library/react` configured in `apps/desktop/`
- [ ] All component tests passing in CI
- [ ] CI pipeline updated with desktop build + test step
- [ ] README: desktop install instructions + screenshot

---

← [Phase 10](./phase-10-distribution.md) | [Phase 12 →](./phase-12-advanced-macos.md)
