#!/bin/bash
set -e
echo "Building AMP site..."
npx vocs build
echo "Finding Vocs output..."
VOCS_OUT=$(find . -path './node_modules' -prune -o -path './.anchor' -prune -o -name 'overview' -type d -print | head -1)
if [ -z "$VOCS_OUT" ]; then
  echo "ERROR: Cannot find Vocs output"
  exit 1
fi
OUTDIR=$(dirname "$VOCS_OUT")
echo "Vocs output at: $OUTDIR"
cp -f site/index.html "$OUTDIR/index.html"
echo "Landing page copied"
if [ "$OUTDIR" != "dist" ]; then
  rm -rf dist
  cp -r "$OUTDIR" dist
  echo "Copied to dist/"
fi
echo "Build complete"
