#!/usr/bin/env bash
# Build Insider and install into an Obsidian vault for local testing.
# Usage: ./install-to-vault.sh /path/to/your/ObsidianVault

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VAULT="${1:-}"

if [[ -z "$VAULT" ]]; then
  echo "Usage: $0 /path/to/your/ObsidianVault"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node.js 18+ from https://nodejs.org/ then re-run."
  exit 1
fi

cd "$ROOT"
npm install
npm run build

DEST="$VAULT/.obsidian/plugins/insider"
mkdir -p "$DEST"
cp manifest.json main.js styles.css "$DEST/"

echo ""
echo "Installed to: $DEST"
echo ""
echo "Next steps in Obsidian:"
echo "  1. Settings → Community plugins → enable Insider"
echo "  2. Settings → Insider → enter DeepSeek API key"
echo "  3. Click the sparkles ribbon icon to open the sidebar"
