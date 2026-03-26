# AMP Devnet Deployment

## Prerequisites

- Solana CLI installed (`solana --version`)
- Anchor CLI installed (`anchor --version`)
- A Solana keypair at `~/.config/solana/id.json` (your deployer wallet)

## Deploy

1. Generate program keypair (first time only):

```bash
bash deploy/generate-keypair.sh
```

2. Update the program ID in:
   - `programs/amp-channel/src/lib.rs` -- `declare_id!("YOUR_PROGRAM_ID")`
   - `Anchor.toml` -- `[programs.localnet]` and `[programs.devnet]` sections
   - `packages/core/src/constants.ts` -- `AMP_PROGRAM_ID`
   - `target/idl/amp_channel.json` -- `"address"` field

3. Rebuild and deploy:

```bash
bash deploy/deploy-devnet.sh
```

## Verify

```bash
solana program show <PROGRAM_ID> --url devnet
```
