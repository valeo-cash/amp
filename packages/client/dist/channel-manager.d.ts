import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AmpPricingManifest } from "@valeo/amp-core";
import { ChannelHandle } from "./types";
/**
 * Internal channel lifecycle manager.
 * Maps hostnames to channel PDAs, tracks sequence counters,
 * and submits on-chain instructions for open/close/top-up.
 */
export declare class ChannelManager {
    private wallet;
    private connection;
    private programId;
    private hostChannels;
    private seqCounters;
    private channelHandles;
    private nonceCounter;
    private program;
    constructor(wallet: Keypair, connection: Connection, programId?: PublicKey);
    /** Check if a channel already exists for a given hostname. */
    getChannelForHost(host: string): PublicKey | undefined;
    /** Get the handle (PDA + metadata) for a channel. */
    getHandle(channelPDA: PublicKey): ChannelHandle | undefined;
    /** Get all active channel handles. */
    getAllHandles(): Map<string, ChannelHandle>;
    /**
     * Open a channel for a host, using pricing from the server's manifest.
     * Returns the channel PDA.
     */
    openChannel(host: string, pricing: AmpPricingManifest, depositHuman: number, mint: PublicKey, settleInterval?: number): Promise<PublicKey>;
    /**
     * Get the next sequence number and sign it with the wallet keypair.
     * Returns `{ seq, sig }` where sig is base58-encoded Ed25519 signature.
     */
    getNextSeqAndSig(channelPDA: PublicKey): {
        seq: number;
        sig: string;
    };
    /**
     * Top up an existing channel with additional funds.
     * Returns the transaction signature.
     */
    topUp(channelPDA: PublicKey, amountHuman: number, mint: PublicKey): Promise<string>;
    /**
     * Close a specific channel. Refunds remaining balance to funder.
     * Returns the transaction signature.
     */
    closeChannel(channelPDA: PublicKey): Promise<string>;
    /**
     * Close all open channels. Returns a map of channel PDA -> tx signature.
     */
    closeAllChannels(): Promise<Map<string, string>>;
}
//# sourceMappingURL=channel-manager.d.ts.map