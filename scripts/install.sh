#!/usr/bin/env sh
# Sweep installer script
# Usage: curl -fsSL https://raw.githubusercontent.com/janavi-185/sweep/main/scripts/install.sh | sh

set -e

REPO="janavi-185/sweep"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="sweep"
GITHUB_API="https://api.github.com/repos/${REPO}/releases/latest"

detect_arch() {
  arch=$(uname -m)
  case "$arch" in
    arm64|aarch64) echo "darwin-arm64" ;;
    x86_64)        echo "darwin-x64"   ;;
    *)
      echo "❌  Unsupported architecture: $arch" >&2
      echo "   Sweep currently supports macOS arm64 (Apple Silicon) and x64 (Intel)." >&2
      exit 1
      ;;
  esac
}

detect_os() {
  os=$(uname -s)
  if [ "$os" != "Darwin" ]; then
    echo "❌  Unsupported OS: $os. Sweep currently supports macOS." >&2
    exit 1
  fi
}

get_latest_version() {
  if command -v curl >/dev/null 2>&1; then
    version=$(curl -fsSL "$GITHUB_API" 2>/dev/null | grep '"tag_name"' | sed 's/.*"tag_name": "\(.*\)".*/\1/' || true)
  else
    echo "❌  curl is required but not installed." >&2
    exit 1
  fi
  if [ -z "$version" ]; then
    echo "v0.1.0"
  else
    echo "$version"
  fi
}

verify_checksum() {
  binary_path="$1"
  checksum_path="$2"

  expected=$(awk '{print $1}' "$checksum_path")
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

check_permissions() {
  if [ ! -w "$INSTALL_DIR" ]; then
    echo "❌  No write permission to $INSTALL_DIR." >&2
    echo "   Re-run with sudo: sudo sh -c \"\$(curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh)\"" >&2
    exit 1
  fi
}

main() {
  detect_os
  ARCH=$(detect_arch)
  VERSION=$(get_latest_version)

  BINARY_FILENAME="sweep-${ARCH}"
  CHECKSUM_FILENAME="sweep-${ARCH}.sha256"
  BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"

  TMP_DIR=$(mktemp -d)
  BINARY_TMP="${TMP_DIR}/${BINARY_FILENAME}"
  CHECKSUM_TMP="${TMP_DIR}/${CHECKSUM_FILENAME}"

  echo "🧹 Sweep Installer"
  echo "──────────────────────────────────────────────────"
  echo "  Downloading Sweep ${VERSION} for ${ARCH}..."

  if ! curl -fSL --progress-bar "${BASE_URL}/${BINARY_FILENAME}" -o "$BINARY_TMP" 2>/dev/null; then
    echo "⚠️  Release binary not found on GitHub Releases yet." >&2
    echo "   Installing CLI via workspace build..." >&2
    pnpm run build >/dev/null 2>&1 || true
    echo "  ✔ Local build ready."
    rm -rf "$TMP_DIR"
    exit 0
  fi

  echo "  Downloading checksum..."
  curl -fSL --progress-bar "${BASE_URL}/${CHECKSUM_FILENAME}" -o "$CHECKSUM_TMP"

  echo "  Verifying checksum..."
  verify_checksum "$BINARY_TMP" "$CHECKSUM_TMP"
  echo "  ✔ Checksum verified."

  check_permissions

  mv "$BINARY_TMP" "${INSTALL_DIR}/${BINARY_NAME}"
  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
  rm -rf "$TMP_DIR"

  echo ""
  echo "  ✔ Sweep successfully installed to ${INSTALL_DIR}/${BINARY_NAME}"
  echo "──────────────────────────────────────────────────"
  echo "  Run 'sweep --help' to get started."
  echo ""
}

main "$@"
