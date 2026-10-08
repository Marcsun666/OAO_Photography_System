#!/usr/bin/env bash
# Build the deployable folder for Cloudflare Pages from the source tree.
# Usage (from the source root):  bash tools/build-deploy.sh ../oao-deploy
# Copies ONLY what the live site needs. Never copies assets/media (student photos, private),
# assets-originals, tests, docs, lib/ or Next.js leftovers.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?usage: bash tools/build-deploy.sh <output-dir>}"
mkdir -p "$OUT"
rm -rf "$OUT/assets" "$OUT/functions" "$OUT/cloud-function"
mkdir -p "$OUT/assets" "$OUT/functions/api" "$OUT/cloud-function"
cp "$SRC"/{index.html,app.js,script.js,styles.css,config.js} "$OUT/"
cp -r "$SRC/assets/brand" "$SRC/assets/events" "$OUT/assets/"
cp "$SRC/functions/_middleware.js" "$OUT/functions/"
cp "$SRC/functions/api/[[path]].js" "$OUT/functions/api/"
cp "$SRC/cloud-function/index.js" "$OUT/cloud-function/"   # bundled into the Function; middleware 404s it as a static file
echo "deploy folder ready: $OUT"
