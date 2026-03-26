import { Keypair } from "@solana/web3.js";
import { MeteringProof, PricingConfig } from "@valeo/amp-core";
interface ChannelUsage {
    channelPDA: string;
    callCount: number;
    bytesConsumed: number;
    secondsConsumed: number;
    totalAmount: number;
    seqStart: number;
    seqEnd: number;
    periodStart: number;
}
/**
 * In-memory usage metering engine.
 * Tracks consumption per channel and generates MeteringProofs for settlement.
 */
export declare class Meter {
    private usage;
    private pricing;
    private routePricing;
    constructor(defaultPricing: PricingConfig, routePricing?: Record<string, Partial<PricingConfig>>);
    /** Record a single API call. */
    recordCall(channelPDA: string, seq: number, route?: string): void;
    /** Record bytes consumed (for per-byte metering). */
    recordBytes(channelPDA: string, bytes: number, seq: number, route?: string): void;
    /** Record seconds elapsed (for per-second streaming metering). */
    recordSeconds(channelPDA: string, seconds: number, seq: number, route?: string): void;
    /** Get current accumulated usage for a channel. */
    getUsage(channelPDA: string): ChannelUsage | undefined;
    /** Check if a channel has any unsettled usage. */
    hasUsage(channelPDA: string): boolean;
    /** Get all channel PDAs with unsettled usage. */
    getChannelsWithUsage(): string[];
    /** Generate a signed MeteringProof for settlement. */
    generateProof(channelPDA: string, serverKeypair: Keypair): MeteringProof;
    /** Reset usage after successful settlement. */
    resetUsage(channelPDA: string): void;
    private getOrCreate;
    private getPricingForRoute;
}
export {};
//# sourceMappingURL=meter.d.ts.map