# AMP Live Demo Server

Real Solana devnet transactions streamed to the landing page via SSE.

## Run locally

```bash
# Requires e2e/.keys/ to exist (run e2e setup first)
cd demo
npm install
npm start
```

Server starts on http://localhost:3402. The landing page auto-connects when running locally.

## Test

```bash
curl -N http://localhost:3402/api/demo/start
```

You'll see real-time SSE events with actual devnet transaction hashes.

## Deploy

Set these environment variables:

- `DEMO_FAUCET_KEY` -- base58 secret key of the faucet wallet
- `DEMO_MINT` -- test USDC mint address
- `SOLANA_RPC` -- devnet RPC URL
- `PORT` -- server port (default: 3402)

Update `DEMO_SERVER_URL` in `site/index.html` to point to the deployed URL.
