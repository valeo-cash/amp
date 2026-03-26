import { PublicKey } from "@solana/web3.js";
/**
 * Derive the ChannelState PDA address.
 * Seeds: [b"amp-channel", funder, recipient, nonce_le_bytes]
 */
export declare function deriveChannelPDA(funder: PublicKey, recipient: PublicKey, nonce: number | bigint, programId?: PublicKey): [PublicKey, number];
/**
 * Derive the channel vault PDA address.
 * Seeds: [b"amp-vault", channel_state_pda]
 */
export declare function deriveVaultPDA(channelState: PublicKey, programId?: PublicKey): [PublicKey, number];
//# sourceMappingURL=pda.d.ts.map