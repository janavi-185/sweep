# Phase 10 — Distribution: curl Installer & Standalone Binary

> **Goal:** Ship StackSweep so any macOS user — developer or not — can install it with one command and zero prerequisites. No Node.js, no npm, no package managers required. A single binary, verified by checksum, delivered via `curl` from GitHub Releases.

---

## Objectives

- Compile StackSweep to standalone binaries for macOS arm64 and x64
- Build a GitHub Actions release pipeline triggered by semver tags
- Write a `scripts/install.sh` that detects arch, downloads, verifies, and installs
- Implement `stacksweep update` for self-updating from GitHub Releases
- Adopt semantic versioning + conventional commits for automated changelog generation
- Document the complete release workflow for maintainers

---

## Why Not `npm install -g`

| Concern | `npm install -g` | Standalone Binary |
|---|---|---|
| Requires Node.js | ✅ Yes — user must install Node first | ❌ No — runtime bundled |
| Version conflicts | Risk of node_modules conflicts | None — fully isolated |
| Installation UX | 3+ steps for non-developers | 1 `curl` command |
| Binary size | ~5 MB (app only) | ~50–90 MB (includes runtime) |
| PATH issues | `npm global` bin can be outside PATH | Installed to `/usr/local/bin` |

For a **storage tool targeting macOS users**, most users already have the disk space. The UX benefit of a single command far outweighs the binary size cost.

---

## Binary Compilation

### Option A: `pkg` (Vercel)

- Bundles Node.js runtime + app code into a single executable
- Mature, battle-tested, broad platform support
- Output size: ~50–80 MB
- Downside: uses an older, patched Node.js runtime. May lag behind current LTS.

### Option B: `bun build --compile` ✅ Recommended

- Bun is used **only as a build tool** — the dev/test workflow stays on Node.js + Vitest
- Produces a single, self-contained binary without a bundled V8
- Uses Bun's JavaScriptCore engine — significantly faster startup than Node.js
- Output size: ~30–45 MB (smaller than pkg)
- Excellent support for macOS arm64 and x64 cross-compilation

```bash
# Install Bun as a CI/build-only tool (not a dev dependency)
curl -fsSL https://bun.sh/install | bash

# Build for macOS arm64 (native on macos-14 runner)
bun build ./packages/cli/src/index.ts \
  --compile \
  --target bun-darwin-arm64 \
  --outfile dist/stacksweep-darwin-arm64

# Build for macOS x64 (native on macos-13 runner)
bun build ./packages/cli/src/index.ts \
  --compile \
  --target bun-darwin-x64 \
  --outfile dist/stacksweep-darwin-x64
```

> [!IMPORTANT]
> `better-sqlite3` is a native Node.js addon. It will **not** work with `bun build --compile` as-is because Bun uses its own SQLite bindings. Swap `better-sqlite3` for `bun:sqlite` (Bun's built-in SQLite) in a `database.bun.ts` adapter, selected via build-time conditional. Keep the `better-sqlite3` adapter for local dev/test with Node.js.

### SQLite Adapter Pattern

```typescript
// packages/database/src/adapter.ts

// Resolved at build time by Bun's module resolution
// For Bun build: import from './bun-sqlite-adapter.js'
// For Node.js:   import from './better-sqlite3-adapter.js'

export interface SqliteAdapter {
  exec(sql: string): void;
  prepare(sql: string): PreparedStatement;
  pragma(stmt: string): unknown;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}
```

### Linux x64 (Future)

Cross-compile with Bun:

```bash
bun build ./packages/cli/src/index.ts \
  --compile \
  --target bun-linux-x64 \
  --outfile dist/stacksweep-linux-x64
```

Stub this in the release pipeline now so the infrastructure is ready. Do not advertise Linux support until tested.

---

## Target Platforms

| Platform | Runner | Binary Name | Status |
|---|---|---|---|
| macOS arm64 (Apple Silicon) | `macos-14` | `stacksweep-darwin-arm64` | Primary |
| macOS x64 (Intel) | `macos-13` | `stacksweep-darwin-x64` | Secondary |
| Linux x64 | `ubuntu-22.04` | `stacksweep-linux-x64` | Future stub |

---

## GitHub Actions Release Pipeline

### File: `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'   # Triggers on: git tag v0.2.0 && git push --tags

permissions:
  contents: write   # Required to create GitHub Releases and upload assets

jobs:
  # ── Job 1: Full CI ───────────────────────────────────────────────────────────
  test:
    name: Run CI
    uses: ./.github/workflows/ci.yml   # Reuse existing CI workflow

  # ── Job 2: Build arm64 ───────────────────────────────────────────────────────
  build-arm64:
    name: Build macOS arm64
    needs: test
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Bun
        run: curl -fsSL https://bun.sh/install | bash && echo "$HOME/.bun/bin" >> $GITHUB_PATH

      - name: Build arm64 binary
        run: |
          bun build ./packages/cli/src/index.ts \
            --compile \
            --target bun-darwin-arm64 \
            --outfile dist/stacksweep-darwin-arm64

      - name: Compute SHA256
        run: |
          shasum -a 256 dist/stacksweep-darwin-arm64 > dist/stacksweep-darwin-arm64.sha256
          cat dist/stacksweep-darwin-arm64.sha256

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: binary-darwin-arm64
          path: |
            dist/stacksweep-darwin-arm64
            dist/stacksweep-darwin-arm64.sha256

  # ── Job 3: Build x64 ─────────────────────────────────────────────────────────
  build-x64:
    name: Build macOS x64
    needs: test
    runs-on: macos-13
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Bun
        run: curl -fsSL https://bun.sh/install | bash && echo "$HOME/.bun/bin" >> $GITHUB_PATH

      - name: Build x64 binary
        run: |
          bun build ./packages/cli/src/index.ts \
            --compile \
            --target bun-darwin-x64 \
            --outfile dist/stacksweep-darwin-x64

      - name: Compute SHA256
        run: |
          shasum -a 256 dist/stacksweep-darwin-x64 > dist/stacksweep-darwin-x64.sha256
          cat dist/stacksweep-darwin-x64.sha256

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: binary-darwin-x64
          path: |
            dist/stacksweep-darwin-x64
            dist/stacksweep-darwin-x64.sha256

  # ── Job 4: Create GitHub Release ─────────────────────────────────────────────
  release:
    name: Create Release
    needs: [build-arm64, build-x64]
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # Full history for changelog generation

      - name: Download arm64 binary
        uses: actions/download-artifact@v4
        with:
          name: binary-darwin-arm64
          path: dist/

      - name: Download x64 binary
        uses: actions/download-artifact@v4
        with:
          name: binary-darwin-x64
          path: dist/

      - name: Generate changelog
        uses: antfu-collective/changelogithub@v0
        id: changelog
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body: ${{ steps.changelog.outputs.changelog }}
          files: |
            dist/stacksweep-darwin-arm64
            dist/stacksweep-darwin-arm64.sha256
            dist/stacksweep-darwin-x64
            dist/stacksweep-darwin-x64.sha256
          draft: false
          prerelease: ${{ contains(github.ref_name, '-beta') || contains(github.ref_name, '-rc') }}
```

---

## `scripts/install.sh`

```bash
#!/usr/bin/env sh
# StackSweep installer
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/stacksweep/main/scripts/install.sh | sh

set -e

REPO="YOUR_ORG/stacksweep"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="stacksweep"
GITHUB_API="https://api.github.com/repos/${REPO}/releases/latest"

# ── Detect architecture ──────────────────────────────────────────────────────
detect_arch() {
  arch=$(uname -m)
  case "$arch" in
    arm64|aarch64) echo "darwin-arm64" ;;
    x86_64)        echo "darwin-x64"   ;;
    *)
      echo "❌  Unsupported architecture: $arch" >&2
      echo "   StackSweep currently supports macOS arm64 and x64." >&2
      exit 1
      ;;
  esac
}

# ── Detect OS ────────────────────────────────────────────────────────────────
detect_os() {
  os=$(uname -s)
  if [ "$os" != "Darwin" ]; then
    echo "❌  Unsupported OS: $os. StackSweep requires macOS." >&2
    exit 1
  fi
}

# ── Get latest release version ───────────────────────────────────────────────
get_latest_version() {
  if command -v curl >/dev/null 2>&1; then
    version=$(curl -fsSL "$GITHUB_API" | grep '"tag_name"' | sed 's/.*"tag_name": "\(.*\)".*/\1/')
  else
    echo "❌  curl is required but not installed." >&2
    exit 1
  fi
  echo "$version"
}

# ── Verify checksum ──────────────────────────────────────────────────────────
verify_checksum() {
  binary_path="$1"
  checksum_path="$2"

  expected=$(cat "$checksum_path" | awk '{print $1}')
  actual=$(shasum -a 256 "$binary_path" | awk '{print $1}')

  if [ "$expected" != "$actual" ]; then
    echo "❌  Checksum mismatch!" >&2
    echo "   Expected: $expected" >&2
    echo "   Actual:   $actual" >&2
    echo "   The downloaded binary may be corrupted or tampered with." >&2
    rm -f "$binary_path" "$checksum_path"
    exit 1
  fi
}

# ── Check write permission ───────────────────────────────────────────────────
check_permissions() {
  if [ ! -w "$INSTALL_DIR" ]; then
    echo "❌  No write permission to $INSTALL_DIR." >&2
    echo "   Re-run with sudo: sudo sh -c \"\$(curl -fsSL <install-url>)\"" >&2
    exit 1
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  detect_os
  ARCH=$(detect_arch)
  VERSION=$(get_latest_version)

  if [ -z "$VERSION" ]; then
    echo "❌  Could not determine latest version from GitHub API." >&2
    echo "   Check your internet connection or visit: https://github.com/${REPO}/releases" >&2
    exit 1
  fi

  BINARY_FILENAME="stacksweep-${ARCH}"
  CHECKSUM_FILENAME="stacksweep-${ARCH}.sha256"
  BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"

  TMP_DIR=$(mktemp -d)
  BINARY_TMP="${TMP_DIR}/${BINARY_FILENAME}"
  CHECKSUM_TMP="${TMP_DIR}/${CHECKSUM_FILENAME}"

  echo "  Downloading StackSweep ${VERSION} for ${ARCH}..."
  curl -fSL --progress-bar "${BASE_URL}/${BINARY_FILENAME}" -o "$BINARY_TMP" || {
    echo "❌  Download failed. Check your connection or visit:" >&2
    echo "   https://github.com/${REPO}/releases/tag/${VERSION}" >&2
    exit 1
  }

  echo "  Downloading checksum..."
  curl -fSL --progress-bar "${BASE_URL}/${CHECKSUM_FILENAME}" -o "$CHECKSUM_TMP" || {
    echo "❌  Checksum download failed." >&2
    exit 1
  }

  echo "  Verifying checksum..."
  verify_checksum "$BINARY_TMP" "$CHECKSUM_TMP"
  echo "  ✔ Checksum verified."

  check_permissions

  mv "$BINARY_TMP" "${INSTALL_DIR}/${BINARY_NAME}"
  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
  rm -rf "$TMP_DIR"

  echo ""
  echo "  ✔ StackSweep installed to ${INSTALL_DIR}/${BINARY_NAME}"
  echo ""
  "${INSTALL_DIR}/${BINARY_NAME}" --version
  echo ""
  echo "  Get started: stacksweep scan ~/"
}

main "$@"
```

---

## User-Facing Install Command

```
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/stacksweep/main/scripts/install.sh | sh
```

**Flags explained:**
- `-f` — fail silently on HTTP errors (don't return partial content)
- `-s` — silent mode (no progress meter)
- `-S` — show errors even in silent mode
- `-L` — follow redirects (GitHub raw URLs may redirect)

---

## `stacksweep update` Command

Checks GitHub Releases for a version newer than the currently running binary and replaces it.

```typescript
// packages/cli/src/commands/update.ts

import os from 'os';
import path from 'path';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const RELEASES_API = 'https://api.github.com/repos/YOUR_ORG/stacksweep/releases/latest';
const CURRENT_VERSION = process.env.STACKSWEEP_VERSION ?? '0.0.0'; // injected at build time

export async function runUpdate(): Promise<void> {
  const spinner = createSpinner('Checking for updates...');
  const release = await fetchLatestRelease();

  if (!isNewer(release.tag_name, CURRENT_VERSION)) {
    spinner.succeed(`Already up to date (${CURRENT_VERSION})`);
    return;
  }

  const arch = os.arch() === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  const binaryAsset   = release.assets.find(a => a.name === `stacksweep-${arch}`);
  const checksumAsset = release.assets.find(a => a.name === `stacksweep-${arch}.sha256`);

  if (!binaryAsset || !checksumAsset) {
    throw new Error(`No binary found for ${arch} in release ${release.tag_name}`);
  }

  spinner.text = `Downloading ${release.tag_name}...`;
  const tmpPath = path.join(os.tmpdir(), `stacksweep-update-${Date.now()}`);
  await downloadFile(binaryAsset.browser_download_url, tmpPath);

  spinner.text = 'Verifying checksum...';
  const expectedChecksum = await fetchText(checksumAsset.browser_download_url);
  verifyChecksum(tmpPath, expectedChecksum.trim().split(/\s+/)[0]);

  // Replace the currently running binary
  const currentBinary = process.execPath;
  fs.chmodSync(tmpPath, 0o755);
  fs.renameSync(tmpPath, currentBinary);  // atomic on same filesystem

  spinner.succeed(`Updated to ${release.tag_name}. Run 'stacksweep --version' to confirm.`);
}

function isNewer(remote: string, local: string): boolean {
  // Compare semver strings. Strip leading 'v'.
  const [rMajor, rMinor, rPatch] = remote.replace('v', '').split('.').map(Number);
  const [lMajor, lMinor, lPatch] = local.replace('v', '').split('.').map(Number);
  return rMajor > lMajor || (rMajor === lMajor && rMinor > lMinor) || (rMajor === lMajor && rMinor === lMinor && rPatch > lPatch);
}

function verifyChecksum(filePath: string, expected: string): void {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (actual !== expected) throw new Error(`Checksum mismatch. Expected ${expected}, got ${actual}.`);
}
```

> [!CAUTION]
> `fs.renameSync(tmpPath, currentBinary)` only works atomically if `tmpPath` and `currentBinary` are on the same filesystem. On macOS, `/tmp` is often on a different volume (`/private/tmp` vs `/usr/local/bin`). Use a temp file in the same directory as the binary instead: `path.join(path.dirname(currentBinary), '.stacksweep-update-tmp')`.

---

## Semantic Versioning & Conventional Commits

### Commit Format

```
<type>(<scope>): <description>

feat(scanner): add incremental scan support
fix(cache): handle mtime comparison on HFS+ volumes
docs(phases): add phase 9 concurrency guide
BREAKING CHANGE: rename --force flag to --no-cache
```

### Version Bump Rules

| Commit prefix | Version bump | Example |
|---|---|---|
| `feat:` | Minor (`0.x.0`) | New command, new flag |
| `fix:` | Patch (`0.0.x`) | Bug fix, typo |
| `perf:`, `refactor:` | Patch | Internal improvement |
| `BREAKING CHANGE:` | Major (`x.0.0`) | Incompatible CLI change |
| `chore:`, `docs:`, `test:` | None | No release |

### Release Workflow for Maintainers

```bash
# 1. Ensure main branch is clean
git checkout main && git pull

# 2. Bump version in package.json files
pnpm version minor   # or patch / major

# 3. Tag and push — triggers release.yml
git tag v0.3.0
git push --tags

# 4. Monitor: https://github.com/YOUR_ORG/stacksweep/actions
# 5. Verify release assets at: https://github.com/YOUR_ORG/stacksweep/releases
```

---

## CHANGELOG.md

Use `changelogithub` (from Anthony Fu) to auto-generate changelogs from conventional commits:

```yaml
# In release.yml
- name: Generate changelog
  uses: antfu-collective/changelogithub@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`changelogithub` groups commits by type, links to PRs, and formats as markdown. It uses the tag range `v0.1.0..v0.2.0` to scope the changelog to the release.

Commit the generated `CHANGELOG.md` to the repo after each release for offline reference:

```bash
npx changelogithub --output CHANGELOG.md
git add CHANGELOG.md && git commit -m "chore: update changelog for v0.3.0"
```

---

## Edge Cases in `install.sh`

| Scenario | Handling |
|---|---|
| Non-macOS OS (Linux, Windows) | Exit with clear error and link to GitHub Releases |
| Unsupported CPU arch (e.g., i386) | Exit with arch-not-supported message |
| No internet / GitHub down | curl exits non-zero → `set -e` exits script; show release URL |
| Checksum mismatch | Delete temp file, exit with security warning |
| No write permission to `/usr/local/bin` | Prompt to re-run with `sudo` |
| Already installed, same version | Silently overwrite (idempotent) |
| GitHub API rate limit (no auth) | Rate limit applies to unauthenticated requests; `releases/latest` is a single call — unlikely to hit limit |
| Partial download | SHA256 mismatch will catch this |

---

## Deliverables

- [ ] SQLite adapter interface created (`SqliteAdapter`) with `better-sqlite3` and `bun:sqlite` implementations
- [ ] Bun installed as CI-only build tool (not in `devDependencies`)
- [ ] `bun build --compile` produces working `stacksweep-darwin-arm64` binary
- [ ] `bun build --compile` produces working `stacksweep-darwin-x64` binary
- [ ] SHA256 checksums computed and published alongside each binary
- [ ] `.github/workflows/release.yml` implemented and validated end-to-end
- [ ] `v*` tag push triggers pipeline without manual intervention
- [ ] GitHub Release created automatically with generated changelog
- [ ] `scripts/install.sh` written and passes shellcheck
- [ ] `install.sh` tested on clean macOS 14 (arm64) — binary installs and runs
- [ ] `install.sh` tested on clean macOS 13 (x64) — binary installs and runs
- [ ] Checksum verification blocks tampered binaries (manual test)
- [ ] `stacksweep update` command implemented and tested
- [ ] `stacksweep update` handles: already up to date, new version available, checksum fail
- [ ] Conventional commit format documented in `CONTRIBUTING.md`
- [ ] `changelogithub` configured and `CHANGELOG.md` generated for first release
- [ ] `STACKSWEEP_VERSION` injected at build time and readable via `--version`
- [ ] Release pipeline documentation added to `docs/releasing.md`

---

← [Phase 9 — Concurrency & Performance](./phase-9-concurrency.md) | [Phase 11 — TBD](./phase-11-tbd.md) →
