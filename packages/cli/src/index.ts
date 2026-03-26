#!/usr/bin/env node

import { Command } from "commander";
import { registerWalletCommands } from "./commands/wallet";
import { registerDiscoverCommand } from "./commands/discover";
import { registerInspectCommand } from "./commands/inspect";
import { registerPayCommand } from "./commands/pay";
import { registerStreamCommand } from "./commands/stream";
import { registerChannelCommands } from "./commands/channel";
import { registerDelegateCommands } from "./commands/delegate";
import { registerServicesCommand } from "./commands/services";
import { registerConfigCommands } from "./commands/config";

const program = new Command();

program
  .name("amp")
  .description("AMP — Autonomous Machine Payments CLI")
  .version("0.2.0");

registerWalletCommands(program);
registerDiscoverCommand(program);
registerInspectCommand(program);
registerPayCommand(program);
registerStreamCommand(program);
registerChannelCommands(program);
registerDelegateCommands(program);
registerServicesCommand(program);
registerConfigCommands(program);

program.parse();
