import { Command } from "commander";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import ora from "ora";
import { loadWallet, createWallet, walletExists } from "../utils/wallet";
import { getConnection, getProgram, getNetworkLabel } from "../utils/connection";
import { loadConfig } from "../utils/config";
import {
  header,
  kvLine,
  success,
  warn,
  green,
  dim,
  trunc,
} from "../utils/display";
import { PublicKey } from "@solana/web3.js";
import { findChannelsByFunder } from "@valeo/amp-core";

export function registerWalletCommands(program: Command): void {
  const wallet = program.command("wallet").description("Wallet management");

  wallet
    .command("create")
    .description("Create a new Solana wallet")
    .action(async () => {
      if (walletExists()) {
        warn("Wallet already exists. Creating a new one will overwrite it.");
      }
      const { keypair, path } = createWallet();
      header("AMP Wallet Created");
      kvLine("Address:", keypair.publicKey.toBase58());
      kvLine("Saved to:", path);
      kvLine("Network:", getNetworkLabel());
      console.log();
      console.log(dim("  Fund your wallet:"));
      console.log(dim("    amp wallet fund"));
      console.log();
    });

  wallet
    .command("balance")
    .description("Check wallet SOL and token balances")
    .action(async () => {
      const kp = loadWallet();
      const conn = getConnection();
      const config = loadConfig();
      const mint = new PublicKey(config.token);

      header("Wallet Balance");
      kvLine("Address:", kp.publicKey.toBase58());
      kvLine("Network:", getNetworkLabel());
      console.log();

      const sol = await conn.getBalance(kp.publicKey);
      kvLine("SOL:", (sol / LAMPORTS_PER_SOL).toFixed(4));

      try {
        const ata = await getAssociatedTokenAddress(mint, kp.publicKey);
        const account = await getAccount(conn, ata);
        kvLine("USDC:", (Number(account.amount) / 1_000_000).toFixed(2));
      } catch {
        kvLine("USDC:", "0.00 (no token account)");
      }

      try {
        const program = getProgram(kp, conn);
        const channels = await findChannelsByFunder(program, kp.publicKey);
        const active = channels.filter((c) => c.account.status === 0);
        const locked = active.reduce(
          (sum, c) => sum + c.account.balance,
          BigInt(0)
        );
        console.log();
        kvLine("Open channels:", active.length.toString());
        kvLine("Locked:", green((Number(locked) / 1_000_000).toFixed(2) + " USDC"));
      } catch {
        /* program may not be available */
      }
      console.log();
    });

  wallet
    .command("fund")
    .description("Airdrop SOL (devnet only)")
    .option("--amount <sol>", "Amount of SOL to airdrop", "2")
    .action(async (opts: { amount: string }) => {
      const config = loadConfig();
      if (config.network.includes("mainnet")) {
        warn("Cannot airdrop on mainnet. Use a faucet or transfer SOL.");
        return;
      }
      const kp = loadWallet();
      const conn = getConnection();
      const amount = parseFloat(opts.amount);
      const spinner = ora(`Airdropping ${amount} SOL...`).start();
      try {
        const sig = await conn.requestAirdrop(
          kp.publicKey,
          amount * LAMPORTS_PER_SOL
        );
        await conn.confirmTransaction(sig, "confirmed");
        const bal = await conn.getBalance(kp.publicKey);
        spinner.stop();
        success(`Airdropped ${amount} SOL to ${trunc(kp.publicKey.toBase58())}`);
        kvLine("Balance:", (bal / LAMPORTS_PER_SOL).toFixed(4) + " SOL");
      } catch (e: any) {
        spinner.stop();
        warn(
          "Airdrop failed (devnet faucet may be rate-limited). " +
            "Try https://faucet.solana.com"
        );
      }
      console.log();
    });
}
