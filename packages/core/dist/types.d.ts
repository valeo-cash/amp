import { PublicKey } from "@solana/web3.js";
export declare enum ChannelStatus {
    Active = 0,
    Closed = 1
}
/**
 * On-chain ChannelState account, deserialized into TypeScript types.
 * Mirrors the Rust `ChannelState` struct in programs/amp-channel/src/state.rs.
 */
export interface ChannelState {
    bump: number;
    funder: PublicKey;
    recipient: PublicKey;
    mint: PublicKey;
    vault: PublicKey;
    balance: bigint;
    totalDeposited: bigint;
    totalConsumed: bigint;
    rateLimit: bigint;
    settleInterval: number;
    lastSettleTs: number;
    nonce: bigint;
    status: ChannelStatus;
    createdAt: number;
    delegate: PublicKey | null;
    delegateLimit: bigint;
    delegateConsumed: bigint;
    stratumEnabled: boolean;
    stratumCycle: number;
    stratumAuthority: PublicKey | null;
    parentChannel: PublicKey | null;
    childChannels: number;
    maxChainDepth: number;
    chainDepth: number;
}
export type MeteringMode = "per-call" | "per-second" | "per-byte" | "per-compute" | "custom";
export interface PricingConfig {
    mode: MeteringMode;
    rate: string;
    token: string;
    minDeposit: string;
    settleInterval: number;
}
export interface RoutePricing {
    [route: string]: Partial<PricingConfig>;
}
/**
 * The full AMP pricing manifest returned by /.well-known/amp.json
 * or embedded in 402 response headers.
 */
export interface AmpPricingManifest {
    amp_version: string;
    recipient: string;
    program_id: string;
    network: string;
    pricing: {
        default: PricingConfig;
        routes?: RoutePricing;
        tools?: RoutePricing;
    };
}
export interface MeteringProof {
    channel: string;
    amount: number;
    callCount: number;
    periodStart: number;
    periodEnd: number;
    seqStart: number;
    seqEnd: number;
    serverSignature: string;
}
export interface AmpHeaders {
    "AMP-Channel": string;
    "AMP-Seq": string;
    "AMP-Sig": string;
}
export interface AmpPricingHeaders {
    "AMP-Version": string;
    "AMP-Pricing": string;
    "AMP-Recipient": string;
    "AMP-Program": string;
    "AMP-Network": string;
}
export declare enum AmpErrorCode {
    AMP_NO_CHANNEL = "AMP_NO_CHANNEL",
    AMP_UNDERFUNDED = "AMP_UNDERFUNDED",
    AMP_CLOSED = "AMP_CLOSED",
    AMP_RATE_EXCEEDED = "AMP_RATE_EXCEEDED",
    AMP_INVALID_PROOF = "AMP_INVALID_PROOF",
    AMP_SETTLE_EARLY = "AMP_SETTLE_EARLY",
    AMP_DEPOSIT_LOW = "AMP_DEPOSIT_LOW",
    AMP_INVALID_SEQ = "AMP_INVALID_SEQ",
    AMP_INVALID_SIG = "AMP_INVALID_SIG"
}
export declare const AmpErrorHttpStatus: Record<AmpErrorCode, number>;
export interface OpenChannelOptions {
    recipient: PublicKey;
    mint?: PublicKey;
    deposit: number;
    rateLimit?: number;
    settleInterval?: number;
    nonce?: number;
}
export interface AmpMcpCredentials {
    channel: string;
    seq: number;
    sig: string;
}
//# sourceMappingURL=types.d.ts.map