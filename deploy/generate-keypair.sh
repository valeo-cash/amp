#!/bin/bash
set -e

echo "Generating AMP program keypair..."
solana-keygen new --outfile target/deploy/amp_channel-keypair.json --no-bip39-passphrase --force

PROGRAM_ID=$(solana-keygen pubkey target/deploy/amp_channel-keypair.json)
echo ""
echo "Program ID: $PROGRAM_ID"
echo ""
echo "Update these files with the new program ID:"
echo "  1. programs/amp-channel/src/lib.rs        → declare_id!(\"$PROGRAM_ID\")"
echo "  2. Anchor.toml                             → [programs.*] amp_channel"
echo "  3. packages/core/src/constants.ts          → AMP_PROGRAM_ID"
echo "  4. target/idl/amp_channel.json             → \"address\" field"
