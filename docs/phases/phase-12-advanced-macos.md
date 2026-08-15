# Phase 12 — Advanced macOS Analysis

> **Goal:** Surface the storage that macOS actively hides from users — the space buried under "System Data" in System Settings that no native tool explains clearly. Identify it, quantify it, explain it, and give the user safe, confirmed paths to reclaim it.

---

## Objectives

- Analyze macOS-specific storage categories that are opaque or entirely invisible in the System Settings storage view
- Detect and report on APFS local Time Machine snapshots, iOS device backups, Mail data, iCloud Drive local copies, orphaned Application Support directories, crash reports, font caches, and `.DS_Store` accumulation
- Implement Full Disk Access detection and guide the user through granting it when required
- Add three new top-level CLI commands: `stacksweep macos`, `stacksweep macos --snapshots`, `stacksweep macos --backups`
- Follow the Phase 5 safety pattern exactly: every deletion requires an explicit per-item explanation and confirmation; no auto-delete

---

## Why This Is Hard

macOS's System Settings → General → Storage presents a category called **"System Data"** that can consume 50–200+ GB on a typical developer machine. The OS provides no breakdown of what constitutes this number. The category is a catch-all for items that Apple's storage scanner either cannot attribute to a specific app or deliberately obscures.

StackSweep Phase 12 does what System Settings does not: it enumerates the specific paths and processes that contribute to this opaque bucket and presents them to the user in plain English.

The challenge is threefold:
1. **Permissions:** Many of these paths require Full Disk Access. Without FDA, attempts to `stat` or `readdir` these paths return `EACCES` silently.
2. **System tools required:** Some data (Time Machine snapshots, iOS backup metadata) is only accessible via Apple command-line tools (`tmutil`, `system_profiler`), not via direct filesystem reads.
3. **Safety threshold is higher:** These items are less obviously "safe to delete" than npm caches. Each item type requires its own tailored explanation and confirmation copy.

---

## Storage Areas

### 1. System Data Breakdown

"System Data" in macOS System Settings includes, but is not limited to:

| Contributor | Typical size |
|---|---|
| APFS local Time Machine snapshots | 5–50 GB |
| CoreData caches (per-app) | 1–10 GB |
| iOS device backups | 5–100 GB per device |
| Mail attachment cache | 2–20 GB |
| iCloud Drive local copies | Variable |
| Orphaned Application Support dirs | 1–10 GB |
| Crash and diagnostic reports | 100 MB–2 GB |
| Font caches | Negligible |

StackSweep reports each category individually with a size estimate, an explanation of what it is, and — where deletion is safe — a confirmation prompt.

---

### 2. Time Machine Local Snapshots

**What they are:** When an external Time Machine backup drive is not connected, macOS takes APFS snapshots of the local volume on a hourly schedule. These are stored on the startup volume itself and count against the user's disk space, though macOS will delete them automatically when disk space drops below a threshold.

**Why users don't know they exist:** They are invisible in Finder, don't appear in System Settings storage categories by name, and are not accessible via ordinary `ls` or `du` commands.

**How to list them:**

```bash
tmutil listlocalsnapshots /
```

Output example:
```
com.apple.TimeMachine.2026-08-10-120042
com.apple.TimeMachine.2026-08-11-120038
com.apple.TimeMachine.2026-08-12-120041
com.apple.TimeMachine.2026-08-13-120039
com.apple.TimeMachine.2026-08-14-120043
```

**How to get snapshot size** (requires parsing `tmutil listlocalsnapshotdates` and `diskutil apfs listsnapshots /`):

```bash
diskutil apfs listSnapshots disk3s1
```

**How to delete a snapshot:**

```bash
tmutil deletelocalsnapshots 2026-08-10-120042
```

> [!IMPORTANT]
> StackSweep must present each snapshot individually with its date and size before offering to delete it. The user must confirm each one. The command must be run with the exact date string extracted from the `tmutil listlocalsnapshots` output.

**User-facing explanation to show in CLI and GUI:**

> "Local Time Machine snapshots are automatic backups macOS keeps on your disk when your external backup drive isn't connected. macOS will delete these automatically when your disk gets full, but you can reclaim the space now. Your data is safe — these are supplemental backups, not your only copy."

**TypeScript implementation shape:**

```typescript
// packages/core/src/macos/snapshots.ts

export interface LocalSnapshot {
  date: string;            // e.g. "2026-08-10-120042"
  displayDate: Date;       // parsed for human display
  sizeBytes: number;       // from diskutil apfs listSnapshots
  deleteCommand: string;   // "tmutil deletelocalsnapshots <date>"
}

export async function listLocalSnapshots(): Promise<LocalSnapshot[]> {
  const output = await exec("tmutil listlocalsnapshots /");
  const lines = output.stdout.trim().split("\n").filter(Boolean);
  return Promise.all(
    lines.map(async (line) => {
      const date = line.replace("com.apple.TimeMachine.", "");
      const size = await getSnapshotSize(date);
      return {
        date,
        displayDate: parseSnapshotDate(date),
        sizeBytes: size,
        deleteCommand: `tmutil deletelocalsnapshots ${date}`,
      };
    })
  );
}

export async function deleteLocalSnapshot(date: string): Promise<void> {
  // Requires user confirmation before this function is ever called
  await exec(`tmutil deletelocalsnapshots ${date}`);
}
```

---

### 3. iOS Device Backups

**Path:** `~/Library/Application Support/MobileSync/Backup/`

Each subdirectory is a UUID corresponding to a device backup. The directory contains no human-readable name by default — the device name and last backup date are encoded in a `Manifest.plist` inside each backup directory.

**Reading backup metadata:**

```typescript
// packages/core/src/macos/ios-backups.ts
import { readFile } from "fs/promises";
import { parsePlist } from "../utils/plist";

export interface iOSBackup {
  uuid: string;
  deviceName: string;
  lastBackupDate: Date;
  productType: string;  // e.g. "iPhone14,2"
  sizeBytes: number;
  path: string;
}

export async function listIOSBackups(): Promise<iOSBackup[]> {
  const backupRoot = path.join(os.homedir(), "Library/Application Support/MobileSync/Backup");
  const entries = await readdir(backupRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  return Promise.all(
    dirs.map(async (dir) => {
      const manifestPath = path.join(backupRoot, dir.name, "Manifest.plist");
      const plist = await parsePlist(manifestPath);
      const size = await getDirSize(path.join(backupRoot, dir.name));
      return {
        uuid: dir.name,
        deviceName: plist.Lockdown?.DeviceName ?? "Unknown Device",
        lastBackupDate: new Date(plist.Date),
        productType: plist.Lockdown?.ProductType ?? "Unknown",
        sizeBytes: size,
        path: path.join(backupRoot, dir.name),
      };
    })
  );
}
```

**Safety rule:** iOS backups are **never auto-deleted**. Each backup is presented individually in the clean view with its device name, date, and size. The user must explicitly confirm deletion of each. The explanation card reads:

> "This is an iTunes/Finder backup of your [Device Name] from [Date]. Deleting it is permanent — you will not be able to restore your device to this point. Only delete if you have a more recent backup or no longer use this device."

---

### 4. Mail Downloads and Attachments

**Paths:**
- `~/Library/Mail/V10/` (or current version subdirectory — version number increments with macOS major releases)
- `~/Library/Containers/com.apple.mail/Data/Library/Mail Downloads/`

**What grows here:** Every attachment you have ever opened in Mail is cached locally. For heavy email users, this can reach 20+ GB.

**How to measure:**

```typescript
// packages/core/src/macos/mail.ts
const MAIL_PATHS = [
  path.join(os.homedir(), "Library/Mail"),
  path.join(os.homedir(), "Library/Containers/com.apple.mail"),
];

export async function getMailStorageReport(): Promise<MailStorageReport> {
  const sizes = await Promise.all(MAIL_PATHS.map(getDirSize));
  return {
    totalBytes: sizes.reduce((a, b) => a + b, 0),
    paths: MAIL_PATHS,
    note: "Includes all Mail message bodies, attachments, and indexes cached locally.",
  };
}
```

> [!WARNING]
> Do not offer to delete the `~/Library/Mail/V10/` directory wholesale. Mail's message store is not a simple cache — deleting it removes locally downloaded messages that may not be server-side if the user uses POP3 or has offline-only messages. Report the size and advise the user to use Mail → Mailbox → Erase Deleted Items and to reduce attachment download settings in Mail preferences. Only offer deletion of the `Mail Downloads/` subdirectory.

---

### 5. iCloud Drive

**Path:** `~/Library/Mobile Documents/`

**Read-only reporting only.** StackSweep never modifies iCloud Drive contents.

**What to report:**
- Total local cache size (files that have been downloaded from iCloud)
- Count of cloud-only files (files stored only in iCloud, 0 bytes on disk — identified by the `com.apple.icloud.itemName` extended attribute)
- Top directories by local size

```typescript
// packages/core/src/macos/icloud.ts
export async function getICloudReport(): Promise<ICloudReport> {
  const icloudRoot = path.join(os.homedir(), "Library/Mobile Documents");
  const { localBytes, cloudOnlyCount } = await walkICloudDir(icloudRoot);
  return { localBytes, cloudOnlyCount, path: icloudRoot };
}

async function isCloudOnly(filePath: string): Promise<boolean> {
  // Files not yet downloaded have the UF_COMPRESSED flag or are 0 bytes
  // with a .icloud extension (e.g., ".foo.icloud")
  return filePath.endsWith(".icloud");
}
```

**User-facing note:** "StackSweep shows iCloud Drive local storage as read-only information. To free space, use Finder → iCloud Drive → right-click → Remove Download on individual items."

---

### 6. Orphaned Application Support Directories

**Path:** `~/Library/Application Support/`

Over time, as apps are uninstalled, their `Application Support` directories are left behind. macOS does not clean these up.

**Detection strategy:** Compare the list of directories in `~/Library/Application Support/` against the list of installed applications obtained from `system_profiler`.

```bash
system_profiler SPApplicationsDataType -json
```

```typescript
// packages/core/src/macos/orphaned-app-support.ts

export async function findOrphanedAppSupportDirs(): Promise<OrphanedDirectory[]> {
  const [supportDirs, installedApps] = await Promise.all([
    readdir(path.join(os.homedir(), "Library/Application Support"), { withFileTypes: true }),
    getInstalledAppBundleIds(),  // parses system_profiler JSON output
  ]);

  const orphaned: OrphanedDirectory[] = [];
  for (const dir of supportDirs.filter((d) => d.isDirectory())) {
    const dirPath = path.join(os.homedir(), "Library/Application Support", dir.name);
    if (!installedApps.has(dir.name) && !KNOWN_SYSTEM_DIRS.has(dir.name)) {
      const size = await getDirSize(dirPath);
      orphaned.push({ name: dir.name, path: dirPath, sizeBytes: size });
    }
  }
  return orphaned.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

// Known system-owned dirs that should never be flagged as orphaned
const KNOWN_SYSTEM_DIRS = new Set([
  "AddressBook", "CallHistoryDB", "com.apple.avconference",
  "com.apple.sharedfilelist", "CrashReporter", "MobileSync",
  // ... extend as needed
]);
```

> [!NOTE]
> The matching heuristic (directory name vs. app bundle ID) is imperfect. Some apps use bundle IDs as their `Application Support` directory name (`com.spotify.client`) while others use human-readable names (`Spotify`). Apply conservative matching: flag only high-confidence orphans and present them as "possibly orphaned" rather than "confirmed junk."

---

### 7. Crash Reports and Diagnostic Data

**Paths:**
- `~/Library/Logs/DiagnosticReports/` — per-user crash reports
- `/Library/Logs/DiagnosticReports/` — system-level crash reports (requires FDA)
- `/Library/Logs/` — system service logs
- `~/Library/Logs/` — per-user application logs

**Safe to delete:** Crash reports and logs older than 30 days are safe to remove. They have no effect on system or application functionality. They exist solely for developer debugging.

```typescript
export async function listOldCrashReports(olderThanDays = 30): Promise<CrashReport[]> {
  const paths = [
    path.join(os.homedir(), "Library/Logs/DiagnosticReports"),
    "/Library/Logs/DiagnosticReports",
  ];
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const reports: CrashReport[] = [];
  for (const dir of paths) {
    const files = await safeReaddir(dir);
    for (const file of files) {
      const stat = await safeStat(path.join(dir, file));
      if (stat && stat.mtimeMs < cutoff) {
        reports.push({ path: path.join(dir, file), sizeBytes: stat.size, mtime: stat.mtime });
      }
    }
  }
  return reports;
}
```

---

### 8. Font Caches and Language Packs

**Font caches:** `~/Library/Caches/com.apple.FontRegistry/` and `~/Library/FontCollections/`. These are regenerated automatically and are safe to delete. Typically small (< 100 MB).

**Language packs:** Some applications install language resources for all locales. Tools like `localclean` (not StackSweep's scope to replicate fully) strip unused locale `.lproj` directories from app bundles. StackSweep reports the total size of non-English `.lproj` directories within `/Applications/` but does not delete them — modifying app bundles breaks code signatures.

---

### 9. Hidden `.DS_Store` Files

`.DS_Store` files are created by Finder in every directory it displays. They store folder view preferences (icon positions, background images, sort order). They serve no purpose on remote filesystems (NFS, SMB, external drives) and are invisible in Finder.

**Reporting only — not offered as a deletion target in normal mode:**

```typescript
export async function getDSStoreReport(rootPath: string): Promise<DSStoreReport> {
  let count = 0;
  let totalBytes = 0;
  await walk(rootPath, async (filePath) => {
    if (path.basename(filePath) === ".DS_Store") {
      const stat = await safeStat(filePath);
      if (stat) { count++; totalBytes += stat.size; }
    }
  });
  return { count, totalBytes, rootPath };
}
```

**CLI output:** `stacksweep macos` prints the count and total size of `.DS_Store` files found across the home directory. The user can pipe the path list to `xargs rm` manually if desired — StackSweep does not offer this as an automated cleanup action in Phase 12.

---

## Full Disk Access (FDA)

### Why FDA is required

macOS restricts access to several paths analysed in this phase without FDA:
- `~/Library/Mail/` — protected
- `~/Library/Application Support/MobileSync/Backup/` — protected
- `/Library/Logs/DiagnosticReports/` — protected (root-level)
- `~/Library/Containers/com.apple.mail/` — protected

Without FDA, `readdir` and `stat` on these paths return `EACCES`. The process does not crash — it receives an access denied error. StackSweep must handle this gracefully.

### FDA detection

```typescript
// packages/core/src/macos/permissions.ts
import { access } from "fs/promises";
import * as os from "os";
import * as path from "path";

// A path that is readable with FDA but returns EACCES without it
const FDA_PROBE_PATH = path.join(os.homedir(), "Library/Application Support/MobileSync");

export async function hasFullDiskAccess(): Promise<boolean> {
  try {
    await access(FDA_PROBE_PATH);
    return true;
  } catch {
    return false;
  }
}
```

### User guidance when FDA is absent

**CLI:**

```
⚠  Full Disk Access is not granted.
   Some storage areas (Mail, iOS backups, system logs) cannot be analysed.

   To grant access:
   1. Open System Settings → Privacy & Security → Full Disk Access
   2. Click the + button and add StackSweep (or the Terminal app if running from terminal)
   3. Re-run this command

   Tip: Open System Settings directly with:
   open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
```

**Desktop:** Persistent warning banner in the macOS Analysis section of the app; "Grant Access" button opens the System Settings URL.

### Graceful degradation

If FDA is not granted, `stacksweep macos` proceeds to analyze the paths that **do not** require FDA (Time Machine snapshots via `tmutil`, crash reports in user-accessible paths, `.DS_Store` counts, font caches) and clearly labels which sections were skipped due to missing permissions.

---

## New CLI Commands

### `stacksweep macos`

Full macOS-specific storage report. Runs all analyzers in this phase sequentially and prints a structured report.

```bash
$ stacksweep macos

macOS Storage Analysis
======================

Local Time Machine Snapshots     3 snapshots    12.4 GB
iOS Device Backups               2 devices      34.1 GB
Mail Storage                     1 account       8.7 GB
Orphaned App Support Dirs       11 directories   2.3 GB
Crash Reports (>30 days)       847 files        420 MB
iCloud Drive (local cache)                      18.2 GB  [read-only]
.DS_Store files                4,203 files       18 MB   [info only]
Font Caches                                      84 MB

Total reclaimable (with confirmation): 49.9 GB
Run `stacksweep macos clean` to review items for deletion.
```

### `stacksweep macos --snapshots`

Time Machine local snapshots only.

```bash
$ stacksweep macos --snapshots

Local Time Machine Snapshots
-----------------------------
  2026-08-10  (5 days ago)   4.1 GB
  2026-08-12  (3 days ago)   4.2 GB
  2026-08-14  (1 day ago)    4.1 GB

Total: 12.4 GB across 3 snapshots

To delete, run: stacksweep macos --snapshots --clean
Each snapshot requires individual confirmation.
```

### `stacksweep macos --backups`

iOS device backups only.

```bash
$ stacksweep macos --backups

iOS Device Backups
-------------------
  iPhone 15 Pro     Last backup: 2026-07-22    22.4 GB
  iPad Air (M2)     Last backup: 2026-06-01    11.7 GB

Total: 34.1 GB across 2 devices

To review for deletion: stacksweep macos --backups --clean
WARNING: Deletion is permanent. Ensure you have a current backup before proceeding.
```

---

## Edge Cases

| Scenario | Handling |
|---|---|
| `tmutil` not available (non-macOS) | Catch `ENOENT` on exec; skip snapshot analysis; log a warning |
| `tmutil listlocalsnapshots` returns empty | Report "No local snapshots found" — not an error |
| Snapshot size unavailable from `diskutil` | Report snapshot with `size: unknown`; still allow deletion with confirmation |
| iOS backup `Manifest.plist` missing or corrupted | Report backup UUID with `deviceName: "Unknown Device"`, `lastBackupDate: unknown`; still show with path and size |
| `system_profiler` takes > 10 seconds | Time out at 15s; proceed with partial installed apps list; mark orphan detection as "incomplete" in report |
| Mail path version mismatch (V9, V11, etc.) | Scan `~/Library/Mail/` with `V[0-9]+` glob instead of hardcoding V10 |
| FDA probe path does not exist (fresh system) | `access` throws `ENOENT` — treat as FDA granted (path missing ≠ access denied); use a fallback probe path |
| User is running as root | Skip FDA check entirely — root has access to all paths |

---

## Unit Tests

```typescript
// packages/core/src/macos/__tests__/snapshots.test.ts
import { listLocalSnapshots } from "../snapshots";
import { exec } from "../../utils/exec";

vi.mock("../../utils/exec");

it("parses tmutil output into LocalSnapshot objects", async () => {
  vi.mocked(exec).mockResolvedValueOnce({
    stdout: [
      "com.apple.TimeMachine.2026-08-10-120042",
      "com.apple.TimeMachine.2026-08-12-120038",
    ].join("\n"),
  });
  // Mock diskutil call for sizes
  vi.mocked(exec).mockResolvedValue({ stdout: "Size:  4294967296" });

  const snapshots = await listLocalSnapshots();
  expect(snapshots).toHaveLength(2);
  expect(snapshots[0].date).toBe("2026-08-10-120042");
  expect(snapshots[0].sizeBytes).toBe(4294967296);
});

it("returns empty array when tmutil output is empty", async () => {
  vi.mocked(exec).mockResolvedValueOnce({ stdout: "" });
  const snapshots = await listLocalSnapshots();
  expect(snapshots).toHaveLength(0);
});
```

```typescript
// packages/core/src/macos/__tests__/ios-backups.test.ts
import { listIOSBackups } from "../ios-backups";
import { readdir } from "fs/promises";
import { parsePlist } from "../../utils/plist";

vi.mock("fs/promises");
vi.mock("../../utils/plist");

it("parses backup metadata from Manifest.plist", async () => {
  vi.mocked(readdir).mockResolvedValue([
    { name: "abc-123", isDirectory: () => true },
  ] as any);
  vi.mocked(parsePlist).mockResolvedValue({
    Date: "2026-07-22T10:00:00Z",
    Lockdown: { DeviceName: "iPhone 15 Pro", ProductType: "iPhone15,2" },
  });

  const backups = await listIOSBackups();
  expect(backups[0].deviceName).toBe("iPhone 15 Pro");
  expect(backups[0].uuid).toBe("abc-123");
});
```

```typescript
// packages/core/src/macos/__tests__/orphaned-app-support.test.ts
import { findOrphanedAppSupportDirs } from "../orphaned-app-support";

it("flags directories not matching any installed app", async () => {
  // Mock readdir to return known + unknown dirs
  // Mock system_profiler to return only "Spotify" as installed
  // Assert "OldApp" is returned as orphaned
  // Assert "Spotify" is not returned
});

it("never flags known system directories as orphaned", async () => {
  // Assert "MobileSync" is not in the orphaned list regardless of system_profiler output
});
```

**Additional required coverage:**

- `hasFullDiskAccess()`: mock `access` to resolve (FDA granted) and reject with `EACCES` (FDA denied)
- `getMailStorageReport()`: mock `getDirSize` for two paths, assert total is sum
- `getDSStoreReport()`: mock `walk` returning `.DS_Store` entries, assert count and total bytes
- `listOldCrashReports()`: mock file stats with mtimes before and after the cutoff; assert only old files returned

---

## Deliverables

- [ ] `packages/core/src/macos/` directory with all analyzer modules
- [ ] `snapshots.ts`: `listLocalSnapshots()`, `deleteLocalSnapshot(date)` using `tmutil`
- [ ] `ios-backups.ts`: `listIOSBackups()` with `Manifest.plist` parsing
- [ ] `mail.ts`: `getMailStorageReport()` for Mail paths
- [ ] `icloud.ts`: `getICloudReport()` — read-only, no deletion offered
- [ ] `orphaned-app-support.ts`: `findOrphanedAppSupportDirs()` using `system_profiler` output
- [ ] `crash-reports.ts`: `listOldCrashReports(olderThanDays)` with mtime filtering
- [ ] `ds-store.ts`: `getDSStoreReport(rootPath)` — count and size only
- [ ] `permissions.ts`: `hasFullDiskAccess()` with FDA probe
- [ ] CLI: `stacksweep macos` command printing full report
- [ ] CLI: `stacksweep macos --snapshots` command
- [ ] CLI: `stacksweep macos --backups` command
- [ ] CLI: `stacksweep macos --snapshots --clean` and `--backups --clean` with per-item confirmation
- [ ] FDA missing: graceful degradation with clear per-section "skipped (FDA required)" labels
- [ ] FDA missing: CLI instructions + System Settings deep-link printed
- [ ] Desktop Phase 11 updated: macOS Analysis page added using Phase 12 sidecar RPCs
- [ ] All unit tests passing with mocked `exec`, `readdir`, and `parsePlist`
- [ ] CI: Phase 12 tests integrated into GitHub Actions pipeline

---

← [Phase 11](./phase-11-desktop-app.md) | [Phase 13 →](./phase-13-future-exploration.md)
