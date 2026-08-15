# Idea: Interactive Storage Explorer (`sweep browse`)

> **Concept:** A terminal-based interactive folder browser that lets you navigate your entire filesystem tree by size — drill in, drill out, and search — without running a separate scan each time.

---

## Problem It Solves

Current `sweep scan` only shows a fixed summary (top 5 files, top 5 dirs). There's no way to:
- Drill into a specific folder to see what's inside it
- Navigate up and down the folder tree interactively
- Search for a specific folder or file by name across the whole system
- Understand *why* a directory is large by exploring its contents

Tools like `ncdu` and `dust` solve this for power users but aren't integrated with Sweep's scan data, safety rules, or cleanup engine.

---

## Proposed Command

```bash
sweep browse [path]        # Start interactive explorer at path (default: ~)
sweep browse ~/Library     # Start at a specific directory
sweep browse --search      # Open with search bar focused
```

---

## UI Layout (Terminal)

```
  Sweep Explorer  ~/Library                         Total: 82.3 GB
  ──────────────────────────────────────────────────────────────────
  ▶ Developer/              45.12 GB  ██████████████████████  54.8%
    Caches/                 12.41 GB  ██████                  15.1%
    Application Support/     8.93 GB  ████                    10.9%
    Containers/              6.20 GB  ███                      7.5%
    Logs/                    3.14 GB  █                        3.8%
    Fonts/                   1.02 GB                           1.2%
    ... 14 more items        5.48 GB
  ──────────────────────────────────────────────────────────────────
  [↑↓] Navigate  [→/Enter] Open  [←/Backspace] Back  [/] Search  [d] Delete  [q] Quit
```

---

## Core Features

### Navigation
- `↑` / `↓` — move cursor between items
- `→` or `Enter` — drill into a directory
- `←` or `Backspace` — go back up one level
- `q` — quit explorer
- Items sorted by size descending by default

### Search
- Press `/` to open a search bar
- Searches names across the **entire current subtree** (not just visible items)
- Results show path + size, press `Enter` to navigate to that directory

### Size Bar
- Visual ASCII bar proportional to size relative to parent
- Shows percentage of parent directory

### Sweep Integration
- Items flagged by a safety rule show a `⚠` indicator (e.g. DerivedData, node_modules)
- Press `c` on a flagged item to jump straight into `sweep clean` for that path
- Press `i` on any item to show the same info as `sweep dev` / `sweep analyze` for that path

### Deleting from the Explorer
Press `d` on any selected item to delete it — this flows through the **same permission-first cleanup engine** as `sweep clean`:

1. Explorer pauses and shows an inline confirmation:
   ```
   ┌─────────────────────────────────────────────────────┐
   │  Delete ~/Library/Developer/Xcode/DerivedData/?     │
   │  Size: 45.12 GB                                     │
   │  This is safe to remove — Xcode will rebuild it.    │
   │                                                     │
   │  [y] Yes, delete    [n] Cancel                      │
   └─────────────────────────────────────────────────────┘
   ```
2. User confirms → `deleteItem()` from the cleaner engine executes
3. Explorer refreshes the tree in-place — the deleted item disappears and parent sizes update
4. Deletion is logged to the SQLite `cleanup_events` table (Phase 7) so it appears in `sweep history`

> **Key principle**: `sweep browse` never deletes silently. Every deletion goes through the same confirmation and audit trail as `sweep clean`. The explorer is just a different *entry point* into the same engine.

For items **not** covered by a safety rule, `d` still works but shows a stronger warning:
```
  ⚠ No safety rule covers this path. Are you sure?
  This item is not a known cache or regenerable artifact.
  [y] Delete anyway    [n] Cancel
```

---

## Technical Approach

### Library Options
- **`blessed`** / **`blessed-contrib`** — mature Node.js TUI library, full keyboard control
- **`ink`** — React-based terminal rendering (cleaner DX, easier to maintain)
- **`terminal-kit`** — lightweight alternative

Recommended: **`ink`** — fits the TypeScript-first codebase and is easier to test.

### Data Source
- Reuses `ScanResult` from `@sweep/core` — no duplicate scanning logic
- On first open, runs `scanDirectory()` in the background with a progress spinner
- Result is cached via `CacheService` (Phase 8) so subsequent `sweep browse` opens instantly

### Architecture
```
apps/cli/src/commands/browse.ts    ← registers `sweep browse` command
packages/core/src/explorer/       ← explorer state machine (selected path, breadcrumbs)
  index.ts
  tree.ts                          ← builds display tree from ScanResult
  search.ts                        ← in-memory search over scan entries
```

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Directory scan is slow (large root) | Show progress bar while scanning, then render |
| Terminal too narrow | Truncate paths with `...`, hide bar chart |
| Permission denied on subdirectory | Mark item with `🔒`, skip gracefully |
| User searches with no results | Show "No matches found" inline |
| Very deep directory tree | Limit display depth, show "Show more" item |

---

## Why Not Just Use `ncdu`?

| Feature | `ncdu` | `sweep browse` |
|---|---|---|
| Terminal tree browser | ✅ | ✅ |
| Integrated with safety rules | ❌ | ✅ |
| One-click into `sweep clean` | ❌ | ✅ |
| Uses cached scan data | ❌ | ✅ |
| macOS developer-aware | ❌ | ✅ |
| Cross-tool consistency | ❌ | ✅ |

---

## Platform Note

- **macOS**: Primary target. Full support from day one.
- **Windows / Linux**: Possible future support. Terminal rendering with `ink` is cross-platform. Path handling needs OS-aware adjustments. See [`future-enhancements.md`](./future-enhancements.md) for cross-platform roadmap.

---

## Status

> 💡 **Idea / Probable** — Not scheduled yet. To be considered after Phase 10 (Installer & Distribution).
