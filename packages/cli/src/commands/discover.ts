import { Command } from "commander";
import {
  header,
  kvLine,
  table,
  dim,
  green,
  warn,
  usdcAmount,
  trunc,
} from "../utils/display";

interface PricingManifest {
  amp_version: string;
  recipient: string;
  program_id: string;
  network: string;
  pricing: {
    default: { mode: string; rate: string; minDeposit: string; settleInterval: number; token: string };
    routes?: Record<string, { mode?: string; rate?: string }>;
  };
}

export async function discoverPricing(url: string): Promise<PricingManifest | null> {
  const origin = new URL(url).origin;
  try {
    const res = await fetch(`${origin}/.well-known/amp.json`);
    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>;
      if (json.amp_version && json.recipient) return json as unknown as PricingManifest;
    }
  } catch { /* fallthrough */ }

  try {
    const res = await fetch(url);
    if (res.status === 402) {
      const pricing = res.headers.get("AMP-Pricing");
      const recipient = res.headers.get("AMP-Recipient");
      const programId = res.headers.get("AMP-Program");
      const network = res.headers.get("AMP-Network");
      if (pricing && recipient) {
        return {
          amp_version: res.headers.get("AMP-Version") || "1.0",
          recipient,
          program_id: programId || "",
          network: network || "solana:devnet",
          pricing: { default: JSON.parse(pricing) },
        };
      }
    }
  } catch { /* fallthrough */ }
  return null;
}

export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover <url>")
    .description("Discover AMP pricing for a URL")
    .action(async (url: string) => {
      const pricing = await discoverPricing(url);
      if (!pricing) {
        warn("Could not discover AMP pricing for this URL.");
        console.log(dim("  The server may not support AMP."));
        console.log();
        return;
      }

      const host = new URL(url).hostname;
      header(`AMP Pricing for ${host}`);
      kvLine("Recipient:", pricing.recipient);
      kvLine("Network:", pricing.network);
      kvLine("Program:", trunc(pricing.program_id));
      console.log();

      const d = pricing.pricing.default;
      const rows: string[][] = [
        ["(default)", d.mode, "$" + usdcAmount(d.rate), "$" + usdcAmount(d.minDeposit)],
      ];
      if (pricing.pricing.routes) {
        for (const [route, p] of Object.entries(pricing.pricing.routes)) {
          rows.push([
            route,
            p.mode || d.mode,
            "$" + usdcAmount(p.rate || d.rate),
            "$" + usdcAmount(d.minDeposit),
          ]);
        }
      }
      table(["Route", "Mode", "Rate", "Min Deposit"], rows);
      console.log();
      kvLine("Settle interval:", d.settleInterval + "s");
      kvLine("Token:", "USDC (" + trunc(d.token || pricing.pricing.default.token || "") + ")");
      console.log();
    });
}
