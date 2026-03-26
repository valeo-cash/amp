import {
  AmpPricingManifest,
  AmpPricingHeaders,
  PricingConfig,
  MeteringMode,
  AMP_VERSION,
  AMP_PROGRAM_ID,
  USDC_MINT,
  USDC_DECIMALS,
} from "@valeo/amp-core";
import { AMPServerConfig, AMPMiddlewareShorthand } from "./types";

/**
 * Parse a rate shorthand string like "0.001/call" into a PricingConfig.
 *
 * Format: "<human_amount>/<mode>"
 * - Amount is in human-readable token units (e.g., 0.001 USDC)
 * - Mode is one of: call, second, byte, compute
 */
export function parseRateString(
  rate: string,
  decimals: number = USDC_DECIMALS
): PricingConfig {
  const parts = rate.split("/");
  if (parts.length !== 2) {
    throw new Error(
      `Invalid rate string "${rate}". Expected format: "<amount>/<mode>" (e.g., "0.001/call")`
    );
  }

  const humanAmount = parseFloat(parts[0]);
  if (isNaN(humanAmount) || humanAmount <= 0) {
    throw new Error(`Invalid rate amount "${parts[0]}". Must be a positive number.`);
  }

  const modeMap: Record<string, MeteringMode> = {
    call: "per-call",
    second: "per-second",
    byte: "per-byte",
    compute: "per-compute",
  };

  const mode = modeMap[parts[1]];
  if (!mode) {
    throw new Error(
      `Invalid metering mode "${parts[1]}". Must be one of: call, second, byte, compute`
    );
  }

  const tokenAmount = Math.round(humanAmount * 10 ** decimals);

  return {
    mode,
    rate: tokenAmount.toString(),
    token: USDC_MINT.toBase58(),
    minDeposit: (tokenAmount * 1000).toString(),
    settleInterval: 3600,
  };
}

/** Build the full AMP pricing manifest for /.well-known/amp.json. */
export function buildPricingManifest(
  config: AMPServerConfig
): AmpPricingManifest {
  return {
    amp_version: AMP_VERSION,
    recipient: config.wallet.publicKey.toBase58(),
    program_id: (config.programId ?? AMP_PROGRAM_ID).toBase58(),
    network: config.network ?? "solana:mainnet-beta",
    pricing: {
      default: config.pricing,
      routes: config.routes,
      tools: config.tools,
    },
  };
}

/** Build AMP pricing response headers for 402 responses. */
export function buildPricingHeaders(
  config: AMPServerConfig,
  route?: string
): Record<string, string> {
  let pricing = config.pricing;
  if (route && config.routes) {
    const routeKeys = Object.keys(config.routes).sort(
      (a, b) => b.length - a.length
    );
    for (const prefix of routeKeys) {
      if (route.startsWith(prefix)) {
        pricing = { ...pricing, ...config.routes[prefix] };
        break;
      }
    }
  }

  return {
    "AMP-Version": AMP_VERSION,
    "AMP-Pricing": JSON.stringify(pricing),
    "AMP-Recipient": config.wallet.publicKey.toBase58(),
    "AMP-Program": (config.programId ?? AMP_PROGRAM_ID).toBase58(),
    "AMP-Network": config.network ?? "solana:mainnet-beta",
  };
}

/**
 * Resolve a shorthand config into a full AMPServerConfig.
 * Used by `AMP.middleware({ rate: "0.001/call" })`.
 */
export function resolveShorthand(shorthand: AMPMiddlewareShorthand): PricingConfig {
  return parseRateString(shorthand.rate);
}
