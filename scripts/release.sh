#!/usr/bin/env bash
# Sweep binary build script for macOS releases
set -euo pipefail

DIST_DIR="dist"
mkdir -p "$DIST_DIR"

ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64) TARGET_ARCH="darwin-arm64" ;;
  x86_64)        TARGET_ARCH="darwin-x64"   ;;
  *)             TARGET_ARCH="darwin-arm64" ;;
esac

echo "🧹 Building Sweep Standalone Release for $TARGET_ARCH..."
pnpm run build

BINARY_PATH="${DIST_DIR}/sweep-${TARGET_ARCH}"
cp apps/cli/dist/index.js "$BINARY_PATH"
chmod +x "$BINARY_PATH"

shasum -a 256 "$BINARY_PATH" > "${BINARY_PATH}.sha256"

echo "  ✔ Binary built at: ${BINARY_PATH}"
echo "  ✔ Checksum created at: ${BINARY_PATH}.sha256"
cat "${BINARY_PATH}.sha256"
