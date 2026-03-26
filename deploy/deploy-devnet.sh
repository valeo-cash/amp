#!/bin/bash
set -e

echo "=== AMP Devnet Deployment ==="

echo "Switching to devnet..."
solana config set --url https://api.devnet.solana.com

BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')
echo "Deployer balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 4" | bc -l 2>/dev/null || echo 0) )); then
  echo "Airdropping SOL for deployment..."
  solana airdrop 5 || echo "Airdrop failed — use https://faucet.solana.com manually"
  sleep 5
fi

PROGRAM_ID=$(solana-keygen pubkey target/deploy/amp_channel-keypair.json)
echo "Program ID: $PROGRAM_ID"

echo "Building program..."
anchor build --no-idl

echo "Deploying to devnet..."
anchor deploy --provider.cluster devnet

echo ""
echo "=== Deployment Complete ==="
echo "Program ID: $PROGRAM_ID"
echo "Network: devnet"
echo "Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
