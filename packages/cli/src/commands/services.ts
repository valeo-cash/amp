import { Command } from "commander";
import { header, warn, dim } from "../utils/display";

export function registerServicesCommand(program: Command): void {
  program
    .command("services")
    .description("List services from on-chain registry")
    .action(async () => {
      header("AMP Service Registry");
      warn("Registry program not yet deployed.");
      console.log(dim("  Services will be discoverable here once amp-registry is live."));
      console.log();
      console.log(dim("  For now, discover individual services:"));
      console.log(dim("    amp discover <url>"));
      console.log();
    });
}
