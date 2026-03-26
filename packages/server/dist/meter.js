"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Meter = void 0;
const amp_core_1 = require("@valeo/amp-core");
/**
 * In-memory usage metering engine.
 * Tracks consumption per channel and generates MeteringProofs for settlement.
 */
class Meter {
    usage = new Map();
    pricing;
    routePricing;
    constructor(defaultPricing, routePricing = {}) {
        this.pricing = defaultPricing;
        this.routePricing = routePricing;
    }
    /** Record a single API call. */
    recordCall(channelPDA, seq, route) {
        const usage = this.getOrCreate(channelPDA, seq);
        usage.callCount++;
        usage.seqEnd = seq;
        const pricing = this.getPricingForRoute(route);
        usage.totalAmount += parseInt(pricing.rate, 10);
    }
    /** Record bytes consumed (for per-byte metering). */
    recordBytes(channelPDA, bytes, seq, route) {
        const usage = this.getOrCreate(channelPDA, seq);
        usage.bytesConsumed += bytes;
        usage.seqEnd = seq;
        const pricing = this.getPricingForRoute(route);
        usage.totalAmount += bytes * parseInt(pricing.rate, 10);
    }
    /** Record seconds elapsed (for per-second streaming metering). */
    recordSeconds(channelPDA, seconds, seq, route) {
        const usage = this.getOrCreate(channelPDA, seq);
        usage.secondsConsumed += seconds;
        usage.seqEnd = seq;
        const pricing = this.getPricingForRoute(route);
        usage.totalAmount += seconds * parseInt(pricing.rate, 10);
    }
    /** Get current accumulated usage for a channel. */
    getUsage(channelPDA) {
        return this.usage.get(channelPDA);
    }
    /** Check if a channel has any unsettled usage. */
    hasUsage(channelPDA) {
        const u = this.usage.get(channelPDA);
        return u !== undefined && u.totalAmount > 0;
    }
    /** Get all channel PDAs with unsettled usage. */
    getChannelsWithUsage() {
        return Array.from(this.usage.entries())
            .filter(([, u]) => u.totalAmount > 0)
            .map(([key]) => key);
    }
    /** Generate a signed MeteringProof for settlement. */
    generateProof(channelPDA, serverKeypair) {
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
        return (0, amp_core_1.signMeteringProof)(proofData, serverKeypair);
    }
    /** Reset usage after successful settlement. */
    resetUsage(channelPDA) {
        this.usage.delete(channelPDA);
    }
    getOrCreate(channelPDA, seq) {
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
    getPricingForRoute(route) {
        if (route) {
            const routeKeys = Object.keys(this.routePricing).sort((a, b) => b.length - a.length);
            for (const prefix of routeKeys) {
                if (route.startsWith(prefix)) {
                    return { ...this.pricing, ...this.routePricing[prefix] };
                }
            }
        }
        return this.pricing;
    }
}
exports.Meter = Meter;
//# sourceMappingURL=meter.js.map