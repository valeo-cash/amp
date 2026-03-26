#!/bin/bash
set -e
npx vocs build
OUTPUT=$(find . -name 'overview' -type d -maxdepth 5 -not -path './node_modules/*' -not -path './.anchor/*' | head -1)
OUTDIR=$(dirname "$OUTPUT")
echo "Vocs output found at: $OUTDIR"
cp -f site/index.html "$OUTDIR/index.html"
echo "Landing page copied to $OUTDIR/index.html"
mkdir -p dist
cp -r "$OUTDIR"/* dist/
echo "All files copied to dist/"
