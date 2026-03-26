import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { ChannelState } from "./types";
/**
 * Fetch and deserialize a ChannelState account from on-chain.
 */
export declare function fetchChannel(channelPDA: PublicKey, program: Program): Promise<ChannelState | null>;
/**
 * Find all channels where the given pubkey is the funder.
 */
export declare function findChannelsByFunder(program: Program, funder: PublicKey): Promise<{
    publicKey: PublicKey;
    account: ChannelState;
}[]>;
/**
 * Find all channels where the given pubkey is the recipient.
 */
export declare function findChannelsByRecipient(program: Program, recipient: PublicKey): Promise<{
    publicKey: PublicKey;
    account: ChannelState;
}[]>;
/** Check if a channel is active and has positive balance. */
export declare function isChannelHealthy(channel: ChannelState): boolean;
/** Calculate seconds until next settlement is allowed. */
export declare function secondsUntilSettlement(channel: ChannelState): number;
/** Deserialize raw Anchor account data into a typed ChannelState. */
export declare function deserializeChannel(raw: Record<string, unknown>): ChannelState;
//# sourceMappingURL=channel.d.ts.map