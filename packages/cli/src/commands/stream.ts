import { Command } from "commander";
import { warn, dim } from "../utils/display";

export function registerStreamCommand(program: Command): void {
  program
    .command("stream <url>")
    .description("Open a streaming connection with metering")
    .action(async (_url: string) => {
      warn("Streaming is not yet implemented in the CLI.");
      console.log(dim("  Per-second metering for WebSocket/SSE streams is coming in v0.3."));
      console.log(dim("  For now, use the TypeScript SDK directly."));
      console.log();
    });
}
