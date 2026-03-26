import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import {
  PricingConfig,
  RoutePricing,
  ChannelState,
  MeteringProof,
} from "@valeo/amp-core";

export interface AMPServerConfig {
  /** Server's Solana keypair (= recipient identity) */
  wallet: Keypair;
  /** Solana RPC connection */
  connection: Connection;
  /** Default pricing for all routes */
  pricing: PricingConfig;
  /** Per-route pricing overrides */
  routes?: RoutePricing;
  /** Per-tool pricing for MCP servers */
  tools?: RoutePricing;
  /** Settlement configuration */
  settlement?: {
    /** Auto-settle when interval elapses. Default: true */
    auto?: boolean;
    /** Override settle interval from pricing. In seconds. */
    interval?: number;
    /** Settle when accumulated usage exceeds this threshold (token smallest unit). */
    threshold?: number;
  };
  /** Solana network identifier. Default: "solana:mainnet-beta" */
  network?: string;
  /** SPL token mint. Defaults to USDC. */
  mint?: PublicKey;
  /** AMP program ID override (for devnet/testing). */
  programId?: PublicKey;
}

/** Shorthand for one-liner middleware: `AMP.middleware({ rate: "0.001/call" })` */
export interface AMPMiddlewareShorthand {
  rate: string;
}

/**
 * AMP request context attached to `req.amp` by the middleware
 * after successful validation.
 */
export interface AMPContext {
  channel: PublicKey;
  channelState: ChannelState;
  seq: number;
  balance: bigint;
  isDelegate: boolean;
}

export interface AMPServerEvents {
  "channel:opened": (channel: PublicKey, state: ChannelState) => void;
  "channel:settled": (
    channel: PublicKey,
    proof: MeteringProof,
    txSig: string
  ) => void;
  "channel:closed": (channel: PublicKey) => void;
  "channel:underfunded": (channel: PublicKey, balance: bigint) => void;
  "channel:rate-exceeded": (channel: PublicKey) => void;
  error: (error: Error, channel?: PublicKey) => void;
}

export interface ChannelCache {
  get(key: string): ChannelState | undefined;
  set(key: string, value: ChannelState): void;
  delete(key: string): void;
}
