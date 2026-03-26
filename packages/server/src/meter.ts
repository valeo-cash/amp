import { Keypair } from "@solana/web3.js";
import { MeteringProof, PricingConfig, signMeteringProof } from "@valeo/amp-core";

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
export class Meter {
  private usage = new Map<string, ChannelUsage>();
  private pricing: PricingConfig;
  private routePricing: Record<string, Partial<PricingConfig>>;

  constructor(
    defaultPricing: PricingConfig,
    routePricing: Record<string, Partial<PricingConfig>> = {}
  ) {
    this.pricing = defaultPricing;
    this.routePricing = routePricing;
  }

  /** Record a single API call. */
  recordCall(channelPDA: string, seq: number, route?: string): void {
    const usage = this.getOrCreate(channelPDA, seq);
    usage.callCount++;
    usage.seqEnd = seq;
    const pricing = this.getPricingForRoute(route);
    usage.totalAmount += parseInt(pricing.rate, 10);
  }

  /** Record bytes consumed (for per-byte metering). */
  recordBytes(channelPDA: string, bytes: number, seq: number, route?: string): void {
    const usage = this.getOrCreate(channelPDA, seq);
    usage.bytesConsumed += bytes;
    usage.seqEnd = seq;
    const pricing = this.getPricingForRoute(route);
    usage.totalAmount += bytes * parseInt(pricing.rate, 10);
  }

  /** Record seconds elapsed (for per-second streaming metering). */
  recordSeconds(channelPDA: string, seconds: number, seq: number, route?: string): void {
    const usage = this.getOrCreate(channelPDA, seq);
    usage.secondsConsumed += seconds;
    usage.seqEnd = seq;
    const pricing = this.getPricingForRoute(route);
    usage.totalAmount += seconds * parseInt(pricing.rate, 10);
  }

  /** Get current accumulated usage for a channel. */
  getUsage(channelPDA: string): ChannelUsage | undefined {
    return this.usage.get(channelPDA);
  }

  /** Check if a channel has any unsettled usage. */
  hasUsage(channelPDA: string): boolean {
    const u = this.usage.get(channelPDA);
    return u !== undefined && u.totalAmount > 0;
  }

  /** Get all channel PDAs with unsettled usage. */
  getChannelsWithUsage(): string[] {
    return Array.from(this.usage.entries())
      .filter(([, u]) => u.totalAmount > 0)
      .map(([key]) => key);
  }

  /** Generate a signed MeteringProof for settlement. */
  generateProof(channelPDA: string, serverKeypair: Keypair): MeteringProof {
    const usage = this.usage.get(channelPDA);
    if (!usage || usage.totalAmount === 0) {
      throw new Error(`No usage to settle for channel ${channelPDA}`);
    }

    const now = Math.floor(Date.now() / 1000);
    const proofData = {
      channel: channelPDA,
      amount: usage.totalAmount,
      callCount: usage.callCount,
      periodStart: usage.periodStart,
      periodEnd: now,
      seqStart: usage.seqStart,
      seqEnd: usage.seqEnd,
    };

    return signMeteringProof(proofData, serverKeypair);
  }

  /** Reset usage after successful settlement. */
  resetUsage(channelPDA: string): void {
    this.usage.delete(channelPDA);
  }

  private getOrCreate(channelPDA: string, seq: number): ChannelUsage {
    let usage = this.usage.get(channelPDA);
    if (!usage) {
      const now = Math.floor(Date.now() / 1000);
      usage = {
        channelPDA,
        callCount: 0,
        bytesConsumed: 0,
        secondsConsumed: 0,
        totalAmount: 0,
        seqStart: seq,
        seqEnd: seq,
        periodStart: now,
      };
      this.usage.set(channelPDA, usage);
    }
    return usage;
  }

  private getPricingForRoute(route?: string): PricingConfig {
    if (route) {
      const routeKeys = Object.keys(this.routePricing).sort(
        (a, b) => b.length - a.length
      );
      for (const prefix of routeKeys) {
        if (route.startsWith(prefix)) {
          return { ...this.pricing, ...this.routePricing[prefix] };
        }
      }
    }
    return this.pricing;
  }
}
