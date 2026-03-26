import { AmpPricingManifest, PricingConfig } from "@valeo/amp-core";
import { AMPServerConfig, AMPMiddlewareShorthand } from "./types";
/**
 * Parse a rate shorthand string like "0.001/call" into a PricingConfig.
 *
 * Format: "<human_amount>/<mode>"
 * - Amount is in human-readable token units (e.g., 0.001 USDC)
 * - Mode is one of: call, second, byte, compute
 */
export declare function parseRateString(rate: string, decimals?: number): PricingConfig;
/** Build the full AMP pricing manifest for /.well-known/amp.json. */
export declare function buildPricingManifest(config: AMPServerConfig): AmpPricingManifest;
/** Build AMP pricing response headers for 402 responses. */
export declare function buildPricingHeaders(config: AMPServerConfig, route?: string): Record<string, string>;
/**
 * Resolve a shorthand config into a full AMPServerConfig.
 * Used by `AMP.middleware({ rate: "0.001/call" })`.
 */
export declare function resolveShorthand(shorthand: AMPMiddlewareShorthand): PricingConfig;
//# sourceMappingURL=pricing.d.ts.map