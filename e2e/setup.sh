#!/usr/bin/env bash
# One-time setup for E2E testing on macOS.
#
# Run with: bash e2e/setup.sh
#
# Prerequisites:
#   - Rust/Cargo installed
#   - Node.js installed
#   - macOS (WebKit WebDriver via safaridriver)
#
set -euo pipefail

echo "=== TooManyTabs E2E Setup ==="

# 1. Install tauri-driver
if command -v tauri-driver &>/dev/null; then
  echo "[OK] tauri-driver already installed: $(tauri-driver --version 2>/dev/null || echo 'unknown version')"
else
  echo "[INSTALLING] tauri-driver..."
  cargo install tauri-driver
  echo "[OK] tauri-driver installed"
fi

# 2. Enable safaridriver (requires sudo on first run)
if /usr/bin/safaridriver --enable 2>/dev/null; then
  echo "[OK] safaridriver enabled"
else
  echo ""
  echo "[ACTION REQUIRED] safaridriver needs to be enabled with sudo:"
  echo "  sudo safaridriver --enable"
  echo ""
  echo "Run that command, then re-run this script."
  exit 1
fi

# 3. Verify npm deps are installed
if [ -d "node_modules/@wdio" ]; then
  echo "[OK] WebDriverIO dependencies installed"
else
  echo "[INSTALLING] npm dependencies..."
  npm install --legacy-peer-deps
  echo "[OK] npm dependencies installed"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "To run E2E tests:"
echo "  npm run e2e:build   # build the debug binary"
echo "  npm run e2e:test    # run tests against built binary"
echo "  npm run e2e         # build + test"
