#!/usr/bin/env bash
# Builds the Chrome Web Store upload: dist/adlumi-<version>.zip
# Contains only the extension itself (no website, store assets, scripts or docs).
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
out="dist/adlumi-${version}.zip"
mkdir -p dist
rm -f "$out"
zip -qr "$out" manifest.json icons popup dashboard src -x '*.DS_Store'
echo "Built $out ($(du -h "$out" | cut -f1)) for version ${version}"
unzip -l "$out" | tail -1
