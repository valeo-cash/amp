#!/bin/bash
set -e

echo "Building AMP site..."

# Build Vocs docs
npx vocs build

# Vocs outputs to docs/dist/ by default
VOCS_OUT="docs/dist"
if [ ! -d "$VOCS_OUT" ]; then
  echo "ERROR: Vocs output not found at $VOCS_OUT"
  exit 1
fi

# Copy landing page over the Vocs root index
cp -f site/index.html "$VOCS_OUT/index.html"
echo "Landing page copied to $VOCS_OUT/index.html"

# Copy to dist/ for Vercel
rm -rf dist
mkdir -p dist
cp -r "$VOCS_OUT"/* dist/
echo "All files copied to dist/"
echo "Build complete."
