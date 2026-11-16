#!/bin/sh
# One-shot installer. Claude runs this during /onboard; you can also run it yourself.
# Safe to re-run: it only installs what is missing and never overwrites your config.
set -e
cd "$(dirname "$0")/.."
say() { printf '%s\n' "$*"; }
need_brew() { command -v brew >/dev/null 2>&1 || { say "Homebrew is missing. Install it from https://brew.sh, then re-run."; exit 1; }; }

[ "$(uname)" = "Darwin" ] || say "Note: built for macOS (Keychain, textutil). Linux works for scanning; swap the Keychain steps for your password manager."
command -v python3 >/dev/null 2>&1 || { need_brew; brew install python; }
command -v node >/dev/null 2>&1 || { need_brew; brew install node; }
say "python3 $(python3 -c 'import sys;print(sys.version.split()[0])')  node $(node -v)"

# Playwright browser for the MCP server (first run downloads Chromium once)
npx -y playwright@latest install chromium >/dev/null 2>&1 && say "playwright chromium ready" || say "playwright browser download skipped (it will download on first use)"

if [ "$1" = "--latex" ] && ! command -v pdflatex >/dev/null 2>&1; then need_brew; brew install --cask mactex-no-gui; fi
command -v pdflatex >/dev/null 2>&1 && say "pdflatex found" || say "pdflatex not installed (fine if you use Overleaf; run with --latex to install)"

mkdir -p data resume/jobs resume/upload
for pair in "config/search.example.json config/search.json" "config/targets.example.json config/targets.json"; do
  set -- $pair; [ -f "$2" ] || cp "$1" "$2"
done
git config core.hooksPath setup/hooks 2>/dev/null || true
say "install done"
