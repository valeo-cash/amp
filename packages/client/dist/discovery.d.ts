import { AmpPricingManifest } from "@valeo/amp-core";
/**
 * Discover AMP pricing for a given URL.
 *
 * Tries two methods in order:
 * 1. GET `{origin}/.well-known/amp.json` — the standard discovery endpoint
 * 2. Send a bare GET to `url` and parse AMP headers from a 402 response
 *
 * Returns `null` if neither method yields valid pricing.
 */
export declare function discoverPricing(url: string): Promise<AmpPricingManifest | null>;
//# sourceMappingURL=discovery.d.ts.map