# @valeo/amp-core

Shared types, PDA derivation, and utilities for the AMP protocol.

## What's Inside

- **Types** -- `ChannelState`, `PricingConfig`, `AmpPricingManifest`, `MeteringProof`, error codes
- **PDA Helpers** -- `deriveChannelPDA()`, `deriveVaultPDA()`
- **Channel Queries** -- `fetchChannel()`, `findChannelsByFunder()`, `findChannelsByRecipient()`
- **Metering** -- `signMeteringProof()`, `verifyMeteringProof()`
- **Constants** -- program ID, USDC mint, seed buffers, protocol limits

## Installation

```bash
npm install @valeo/amp-core
```

## Usage

```typescript
import {
  deriveChannelPDA,
  deriveVaultPDA,
  fetchChannel,
  USDC_MINT,
  AMP_PROGRAM_ID,
} from "@valeo/amp-core";

const [channelPDA] = deriveChannelPDA(funderPubkey, recipientPubkey, 0);
const [vaultPDA] = deriveVaultPDA(channelPDA);

const channel = await fetchChannel(channelPDA, program);
console.log(channel?.balance);
```

## License

MIT
