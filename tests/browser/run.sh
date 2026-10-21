#!/usr/bin/env bash
#
# LeafGuru — real-browser test runner.
#
# Drives the app in a real Chromium (Playwright container, browsers
# preinstalled) and asserts VISIBLE state, not just the absence of
# console errors. Unit tests use DOM stubs and structurally cannot catch
# browser-level bugs: modal dialogs live in the top layer, `hidden` can
# be overridden by `display`, and native form validation can block a
# submit silently.
#
# Usage:
#   tests/browser/run.sh              # all checks
#   tests/browser/run.sh sweep        # one script
#
# Requires: the app container running (docker compose up -d --build).
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="mcr.microsoft.com/playwright:v1.48.0-jammy"
APP_URL="${LEAFGURU_URL:-http://127.0.0.1:6016}"
SHOTS="${OUT_DIR:-/tmp/leafguru-shots}"

SCRIPTS=("sweep" "profiles" "demo-catalog")
if [ $# -gt 0 ]; then SCRIPTS=("$@"); fi

mkdir -p "$SHOTS"

# playwright-core is vendored in the repo's git-ignored node_modules
if [ ! -d "$REPO/node_modules/playwright-core" ]; then
  echo "!! node_modules/playwright-core is missing."
  echo "   npm install --no-save playwright-core   (or use the vendored copy)"
  exit 1
fi

failed=0
for name in "${SCRIPTS[@]}"; do
  script="$REPO/tests/browser/${name}.js"
  if [ ! -f "$script" ]; then
    echo "!! unknown script: $name"
    failed=1
    continue
  fi
  echo ""
  echo "=============================================================="
  echo "  $name"
  echo "=============================================================="
  docker run --rm --network host \
    -v "$REPO:/w" \
    -v "$SHOTS:/shots" \
    -e "LEAFGURU_URL=$APP_URL" \
    -e "OUT_DIR=/shots" \
    -e "PLAYWRIGHT_PATH=/w/node_modules/playwright-core" \
    -w /w \
    "$IMAGE" node "/w/tests/browser/${name}.js"
  if [ $? -ne 0 ]; then
    echo ">>> $name FAILED"
    failed=1
  fi
done

echo ""
if [ $failed -eq 0 ]; then
  echo "all browser checks passed"
else
  echo "browser checks FAILED"
fi
exit $failed
