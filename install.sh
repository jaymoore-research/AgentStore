#!/bin/sh
set -e

# AgentStore installer
# Usage: curl -fsSL https://raw.githubusercontent.com/jaymoore-research/AgentStore/main/install.sh | sh

REPO="jaymoore-research/AgentStore"
INSTALL_DIR="/usr/local/bin"
APP_DIR="/Applications"

main() {
  detect_platform
  fetch_release
  install_cli
  if [ "$INSTALL_GUI" = "1" ]; then
    install_gui
  fi
  echo ""
  echo "Done. Run 'agentstore --help' to get started."
}

detect_platform() {
  OS=$(uname -s)
  ARCH=$(uname -m)

  case "$OS" in
    Darwin) PLATFORM="macos" ;;
    Linux)  PLATFORM="linux" ;;
    *)      echo "Unsupported OS: $OS"; exit 1 ;;
  esac

  case "$ARCH" in
    arm64|aarch64) ARCH_LABEL="aarch64" ;;
    x86_64)        ARCH_LABEL="x86_64" ;;
    *)             echo "Unsupported architecture: $ARCH"; exit 1 ;;
  esac

  echo "Detected: $PLATFORM ($ARCH_LABEL)"
}

fetch_release() {
  echo "Fetching latest release..."
  RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")
  TAG=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*: "//;s/".*//')
  echo "Latest release: $TAG"
}

get_asset_url() {
  pattern="$1"
  echo "$RELEASE_JSON" | grep '"browser_download_url"' | grep "$pattern" | head -1 | sed 's/.*: "//;s/".*//'
}

install_cli() {
  # Look for a CLI binary asset matching the platform
  CLI_URL=$(get_asset_url "agentstore-cli.*$ARCH_LABEL\|agentstore[^_]")

  if [ -z "$CLI_URL" ]; then
    # Fallback: look for bare binary named "agentstore"
    CLI_URL=$(get_asset_url '"agentstore"')
  fi

  if [ -z "$CLI_URL" ]; then
    echo "No CLI binary found for $PLATFORM $ARCH_LABEL. Skipping CLI install."
    echo "You can build from source: cargo build --release -p agentstore-cli"
    return
  fi

  echo "Downloading CLI..."
  TMPDIR_CLI=$(mktemp -d)
  curl -fsSL "$CLI_URL" -o "$TMPDIR_CLI/agentstore"
  chmod +x "$TMPDIR_CLI/agentstore"

  if [ -w "$INSTALL_DIR" ]; then
    mv "$TMPDIR_CLI/agentstore" "$INSTALL_DIR/agentstore"
  else
    echo "Installing to $INSTALL_DIR (requires sudo)..."
    sudo mv "$TMPDIR_CLI/agentstore" "$INSTALL_DIR/agentstore"
  fi
  rm -rf "$TMPDIR_CLI"

  echo "CLI installed to $INSTALL_DIR/agentstore"
}

install_gui() {
  if [ "$PLATFORM" != "macos" ]; then
    echo "GUI install is macOS only for now."
    return
  fi

  DMG_URL=$(get_asset_url "\.dmg")
  if [ -z "$DMG_URL" ]; then
    echo "No .dmg found in release. Skipping GUI install."
    return
  fi

  echo "Downloading desktop app..."
  TMPDIR_GUI=$(mktemp -d)
  DMG_PATH="$TMPDIR_GUI/AgentStore.dmg"
  curl -fsSL "$DMG_URL" -o "$DMG_PATH"

  echo "Mounting DMG..."
  MOUNT_POINT=$(hdiutil attach "$DMG_PATH" -nobrowse -noautoopen | grep "/Volumes" | awk '{print $NF}')

  APP_SRC=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" | head -1)
  if [ -z "$APP_SRC" ]; then
    echo "No .app found in DMG."
    hdiutil detach "$MOUNT_POINT" -quiet
    rm -rf "$TMPDIR_GUI"
    return
  fi

  APP_NAME=$(basename "$APP_SRC")
  echo "Installing $APP_NAME to $APP_DIR..."

  if [ -d "$APP_DIR/$APP_NAME" ]; then
    rm -rf "$APP_DIR/$APP_NAME"
  fi
  cp -R "$APP_SRC" "$APP_DIR/$APP_NAME"

  # Strip quarantine (this is the whole point of the curl installer)
  xattr -cr "$APP_DIR/$APP_NAME" 2>/dev/null || true

  hdiutil detach "$MOUNT_POINT" -quiet
  rm -rf "$TMPDIR_GUI"

  echo "Desktop app installed to $APP_DIR/$APP_NAME"
}

# Parse flags
INSTALL_GUI=0
for arg in "$@"; do
  case "$arg" in
    --gui) INSTALL_GUI=1 ;;
    --help|-h)
      echo "Usage: install.sh [--gui]"
      echo ""
      echo "  --gui    Also install the macOS desktop app"
      echo ""
      echo "By default, installs only the CLI binary."
      exit 0
      ;;
  esac
done

main
