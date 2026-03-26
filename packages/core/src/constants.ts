import { PublicKey } from "@solana/web3.js";

export const AMP_PROGRAM_ID = new PublicKey(
  "2d1B2PmumwYWuR82AbXAARTL1nrn8N7Vu9bLXTXUDmVA"
);

export const AMP_PROGRAM_ID_DEVNET = new PublicKey(
  "2KQCaQ9j8YtewZ4QjmDfnsVANZXLBcPSYFhAj2eUNaPP"
);

export const AMP_PROGRAM_ID_MAINNET = new PublicKey(
  "2d1B2PmumwYWuR82AbXAARTL1nrn8N7Vu9bLXTXUDmVA"
);

export const CHANNEL_SEED = Buffer.from("amp-channel");
export const VAULT_SEED = Buffer.from("amp-vault");

export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
export const USDC_MINT_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export const USDC_DECIMALS = 6;

export const MAX_CHAIN_DEPTH = 3;
export const MIN_SETTLE_INTERVAL = 60;
export const MAX_SETTLE_INTERVAL = 86_400 * 30;
export const CHANNEL_STATE_SIZE = 8 + 329;

export const AMP_VERSION = "1.0";
