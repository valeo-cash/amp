import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { ChannelState, AmpErrorCode } from "@valeo/amp-core";
import { AMPContext, ChannelCache } from "./types";
/**
 * In-memory channel state cache with TTL-based expiry.
 */
export declare class ChannelStateCache implements ChannelCache {
    private entries;
    private seqTracker;
    get(key: string): ChannelState | undefined;
    set(key: string, value: ChannelState): void;
    delete(key: string): void;
    getLastSeq(channelKey: string): number;
    setLastSeq(channelKey: string, seq: number): void;
}
/**
 * Verify that an AMP-Sig is a valid Ed25519 signature of AMP-Seq
 * by the given public key.
 */
export declare function verifyAmpSig(seq: number, sig: string, pubkey: PublicKey): boolean;
/**
 * Validate an incoming AMP request.
 *
 * 1. Fetch/cache ChannelState
 * 2. Verify channel is Active
 * 3. Verify balance > 0
 * 4. Verify ed25519 signature of seq by funder (or delegate)
 * 5. Verify seq > last_seen_seq
 */
export declare function validateRequest(channelPDA: PublicKey, seq: number, sig: string, program: Program, cache: ChannelStateCache): Promise<{
    valid: boolean;
    error?: AmpErrorCode;
    context?: AMPContext;
}>;
//# sourceMappingURL=validator.d.ts.map