import { Command } from "commander";
import { discoverPricing } from "./discover";
import {
  header,
  kvLine,
  dim,
  green,
  warn,
  usdcAmount,
  trunc,
} from "../utils/display";

export function registerInspectCommand(program: Command): void {
  program
    .command("inspect <url>")
    .description("Show server pricing without paying")
    .action(async (url: string) => {
      const pricing = await discoverPricing(url);
      if (!pricing) {
        warn("Could not discover AMP pricing for this URL.");
        console.log();
        return;
      }

      const d = pricing.pricing.default;
      header(`AMP Inspection for ${new URL(url).host}`);
      console.log(dim("  Server responded: 402 Payment Required"));
      console.log();
      kvLine("Mode:", d.mode);
      kvLine("Rate:", "$" + usdcAmount(d.rate) + ` (${d.rate} smallest units)`);
      kvLine("Token:", "USDC");
      kvLine("Min deposit:", "$" + usdcAmount(d.minDeposit));
      kvLine("Settle interval:", d.settleInterval + "s");
      console.log();
      kvLine("Recipient:", pricing.recipient);
      kvLine("Program:", trunc(pricing.program_id));
      console.log();
      console.log(dim("  To pay for this request:"));
      console.log(green(`    amp pay ${url}`));
      console.log();
    });
}
