import { Command } from "commander";
import { loadConfig, setConfigValue, getConfigPath } from "../utils/config";
import { header, kvLine, success, dim, trunc } from "../utils/display";

export function registerConfigCommands(program: Command): void {
  const cfg = program.command("config").description("Configuration management");

  cfg
    .command("show")
    .description("Show current config")
    .action(async () => {
      const config = loadConfig();
      header(`AMP Configuration (${getConfigPath()})`);
      kvLine("network:", config.network);
      kvLine("wallet:", config.walletPath);
      kvLine("budget:", (Number(config.defaultBudget) / 1_000_000).toFixed(2) + " USDC");
      kvLine("token:", "USDC (" + trunc(config.token) + ")");
      kvLine("program:", trunc(config.programId));
      kvLine("rpc:", config.rpcUrl);
      console.log();
    });

  cfg
    .command("set <key> <value>")
    .description("Set a config value")
    .action(async (key: string, value: string) => {
      setConfigValue(key, value);
      success(`${key} set to ${value}`);
      console.log();
    });
}

export function registerConfigShowAlias(program: Command): void {
  program
    .command("config-show", { hidden: true })
    .action(async () => {
      const config = loadConfig();
      header(`AMP Configuration`);
      for (const [k, v] of Object.entries(config)) {
        kvLine(k + ":", String(v));
      }
      console.log();
    });
}
