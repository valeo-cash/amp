import { AmpPricingManifest, PricingConfig } from "@valeo/amp-core";

/**
 * Discover AMP pricing for a given URL.
 *
 * Tries two methods in order:
 * 1. GET `{origin}/.well-known/amp.json` — the standard discovery endpoint
 * 2. Send a bare GET to `url` and parse AMP headers from a 402 response
 *
 * Returns `null` if neither method yields valid pricing.
 */
export async function discoverPricing(
  url: string
): Promise<AmpPricingManifest | null> {
  const origin = new URL(url).origin;

  const manifest = await discoverViaWellKnown(origin);
  if (manifest) return manifest;

  return discoverVia402(url);
}

async function discoverViaWellKnown(
  origin: string
): Promise<AmpPricingManifest | null> {
  try {
    const res = await globalThis.fetch(`${origin}/.well-known/amp.json`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.amp_version && json.recipient && json.pricing?.default) {
      return json as AmpPricingManifest;
    }
    return null;
  } catch {
    return null;
  }
}

async function discoverVia402(
  url: string
): Promise<AmpPricingManifest | null> {
  try {
    const res = await globalThis.fetch(url);
    if (res.status !== 402) return null;

    const pricingHeader = res.headers.get("AMP-Pricing");
    const recipientHeader = res.headers.get("AMP-Recipient");
    const programHeader = res.headers.get("AMP-Program");
    const networkHeader = res.headers.get("AMP-Network");
    const versionHeader = res.headers.get("AMP-Version");

    if (!pricingHeader || !recipientHeader) return null;

    const pricing: PricingConfig = JSON.parse(pricingHeader);

    return {
      amp_version: versionHeader ?? "1.0",
      recipient: recipientHeader,
      program_id: programHeader ?? "",
      network: networkHeader ?? "solana:mainnet-beta",
      pricing: { default: pricing },
    };
  } catch {
    return null;
  }
}
