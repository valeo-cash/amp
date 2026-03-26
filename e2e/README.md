# AMP End-to-End Tests

Real Solana devnet tests for the AMP protocol.

## Prerequisites

1. Deploy the amp-channel program to devnet (see `deploy/README.md`)
2. Ensure you have SOL in your deployer wallet for fees

## Run

```bash
# 1. Install dependencies
cd e2e && npm install

# 2. Setup test wallets, mint, and fund accounts
npm run setup

# 3. Run full lifecycle test (open -> consume -> top-up -> settle -> close)
npm run test:lifecycle

# 4. Run delegation test
npm run test:delegation

# 5. Run channel chaining test
npm run test:chain
```

## Test Wallets

After `npm run setup`, keypairs are saved to `e2e/.keys/`:

- `funder.json` -- the agent wallet
- `recipient.json` -- the service provider wallet
- `sub-agent.json` -- for delegation and chaining tests
- `config.json` -- all pubkeys, ATAs, and mint address

## Note

These tests use real devnet transactions. Each test run creates unique channels
(nonce = timestamp). The settle interval is set to 60 seconds, so tests that
involve settlement will wait ~65 seconds between steps.
