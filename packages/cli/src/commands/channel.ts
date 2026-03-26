import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import ora from "ora";
import { deriveChannelPDA, deriveVaultPDA, findChannelsByFunder } from "@valeo/amp-core";
import { loadWallet } from "../utils/wallet";
import { getConnection, getProgram, getProgramId, getNetworkLabel } from "../utils/connection";
import { loadConfig, cacheChannel, removeCachedChannel } from "../utils/config";
import {
  header,
  kvLine,
  success,
  fail,
  warn,
  dim,
  green,
  cyan,
  trunc,
  table,
  usdcAmount,
  explorerLink,
} from "../utils/display";

export function registerChannelCommands(program: Command): void {
  const ch = program.command("channel").description("Channel management");

  ch.command("open <recipient>")
    .description("Open a channel manually")
    .option("--deposit <amount>", "Deposit in USDC", "5.00")
    .option("--settle-interval <sec>", "Settlement interval", "60")
    .action(async (recipient: string, opts: any) => {
      const kp = loadWallet();
      const conn = getConnection();
      const prog = getProgram(kp, conn);
      const config = loadConfig();
      const programId = getProgramId();
      const mint = new PublicKey(config.token);
      const recipientPk = new PublicKey(recipient);
      const deposit = Math.round(parseFloat(opts.deposit) * 1_000_000);
      const interval = parseInt(opts.settleInterval);
      const nonce = Date.now();

      const [pda] = deriveChannelPDA(kp.publicKey, recipientPk, nonce, programId);
      const [vault] = deriveVaultPDA(pda, programId);
      const funderAta = await getAssociatedTokenAddress(mint, kp.publicKey);

      const spinner = ora("Opening channel...").start();
      const tx = await (prog.methods as any)
        .openChannel(new BN(deposit), new BN(deposit), new BN(interval), new BN(nonce))
        .accounts({
          funder: kp.publicKey, recipient: recipientPk, mint,
          channelState: pda, vault, funderTokenAccount: funderAta,
          systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([kp]).rpc();
      spinner.stop();

      header("Channel Opened");
      kvLine("Channel:", pda.toBase58());
      kvLine("Recipient:", trunc(recipient));
      kvLine("Deposit:", green(usdcAmount(deposit) + " USDC"));
      kvLine("Settle:", interval + "s");
      kvLine("TX:", trunc(tx));
      console.log(dim("  Explorer: " + explorerLink("tx", tx, config.network)));

      cacheChannel(recipient, { pda: pda.toBase58(), recipient, nonce, lastSeq: 0, openedAt: new Date().toISOString() });
      console.log();
    });

  ch.command("list")
    .description("List all open channels")
    .action(async () => {
      const kp = loadWallet();
      const conn = getConnection();
      const prog = getProgram(kp, conn);
      const spinner = ora("Fetching channels...").start();
      const channels = await findChannelsByFunder(prog, kp.publicKey);
      spinner.stop();
      const active = channels.filter((c) => c.account.status === 0);

      if (active.length === 0) {
        header("No open channels");
        console.log();
        return;
      }

      header(`Open Channels (${active.length})`);
      const rows = active.map((c) => [
        trunc(c.publicKey.toBase58()),
        trunc(c.account.recipient.toBase58()),
        usdcAmount(c.account.balance),
        usdcAmount(c.account.totalConsumed),
        "Active",
      ]);
      table(["Channel", "Recipient", "Balance", "Consumed", "Status"], rows);

      const totalLocked = active.reduce((s, c) => s + c.account.balance, BigInt(0));
      console.log();
      kvLine("Total locked:", green(usdcAmount(totalLocked) + " USDC"));
      console.log();
    });

  ch.command("info <channel>")
    .description("Show channel details")
    .action(async (channelAddr: string) => {
      const kp = loadWallet();
      const conn = getConnection();
      const prog = getProgram(kp, conn);
      const pda = new PublicKey(channelAddr);
      const config = loadConfig();

      const spinner = ora("Fetching channel...").start();
      let state: any;
      try {
        state = await (prog.account as any).channelState.fetch(pda);
      } catch {
        spinner.stop();
        fail("Channel not found on-chain. It may have been closed.");
        return;
      }
      spinner.stop();

      header("Channel Details");
      kvLine("PDA:", pda.toBase58());
      kvLine("Funder:", state.funder.toBase58());
      kvLine("Recipient:", state.recipient.toBase58());
      kvLine("Token:", "USDC");
      kvLine("Status:", state.status === 0 ? green("Active") : "Closed");
      console.log();
      kvLine("Balance:", green(usdcAmount(state.balance.toString()) + " USDC"));
      kvLine("Deposited:", usdcAmount(state.totalDeposited.toString()) + " USDC");
      kvLine("Consumed:", usdcAmount(state.totalConsumed.toString()) + " USDC");
      kvLine("Rate limit:", usdcAmount(state.rateLimit.toString()) + " USDC/interval");
      kvLine("Settle:", state.settleInterval.toString() + "s");
      console.log();
      kvLine("Delegate:", state.delegate ? state.delegate.toBase58() : "None");
      kvLine("Chain depth:", state.chainDepth.toString());
      kvLine("Children:", state.childChannels.toString());
      console.log(dim("  Explorer: " + explorerLink("address", pda.toBase58(), config.network)));
      console.log();
    });

  ch.command("top-up <channel>")
    .description("Add funds to a channel")
    .option("--amount <usdc>", "Amount in USDC", "1.00")
    .action(async (channelAddr: string, opts: any) => {
      const kp = loadWallet();
      const prog = getProgram(kp);
      const config = loadConfig();
      const mint = new PublicKey(config.token);
      const pda = new PublicKey(channelAddr);
      const [vault] = deriveVaultPDA(pda, getProgramId());
      const funderAta = await getAssociatedTokenAddress(mint, kp.publicKey);
      const amount = Math.round(parseFloat(opts.amount) * 1_000_000);

      const spinner = ora("Topping up...").start();
      await (prog.methods as any)
        .topUp(new BN(amount))
        .accounts({ funder: kp.publicKey, channelState: pda, vault, funderTokenAccount: funderAta, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([kp]).rpc();
      spinner.stop();
      success(`Added ${green(usdcAmount(amount) + " USDC")} to ${cyan(trunc(channelAddr))}`);
      console.log();
    });

  ch.command("close <channel>")
    .description("Close a channel (refund remaining)")
    .action(async (channelAddr: string) => {
      await closeChannel(channelAddr);
    });

  ch.command("close-all")
    .description("Close all open channels")
    .action(async () => {
      const kp = loadWallet();
      const prog = getProgram(kp);
      const spinner = ora("Fetching channels...").start();
      const channels = await findChannelsByFunder(prog, kp.publicKey);
      spinner.stop();
      const active = channels.filter((c) => c.account.status === 0);
      if (active.length === 0) {
        header("No open channels to close");
        console.log();
        return;
      }
      header(`Closing ${active.length} channels...`);
      let totalRefunded = BigInt(0);
      for (const c of active) {
        try {
          await closeChannel(c.publicKey.toBase58());
          totalRefunded += c.account.balance;
        } catch (e: any) {
          fail(`Failed to close ${trunc(c.publicKey.toBase58())}: ${e.message}`);
        }
      }
      console.log();
      kvLine("Total refunded:", green(usdcAmount(totalRefunded) + " USDC"));
      console.log();
    });
}

async function closeChannel(channelAddr: string): Promise<void> {
  const kp = loadWallet();
  const prog = getProgram(kp);
  const config = loadConfig();
  const mint = new PublicKey(config.token);
  const pda = new PublicKey(channelAddr);
  const [vault] = deriveVaultPDA(pda, getProgramId());

  let state: any;
  try {
    state = await (prog.account as any).channelState.fetch(pda);
  } catch {
    fail("Channel not found on-chain.");
    return;
  }

  const funderAta = await getAssociatedTokenAddress(mint, kp.publicKey);
  const recipientAta = await getAssociatedTokenAddress(mint, state.recipient);

  const spinner = ora(`Closing ${trunc(channelAddr)}...`).start();
  await (prog.methods as any)
    .closeChannel(new BN(0))
    .accounts({
      closer: kp.publicKey, funder: kp.publicKey, recipient: state.recipient,
      channelState: pda, vault, funderTokenAccount: funderAta,
      recipientTokenAccount: recipientAta, tokenProgram: TOKEN_PROGRAM_ID,
      parentChannelState: null,
    })
    .signers([kp]).rpc();
  spinner.stop();
  success(`Closed ${cyan(trunc(channelAddr))} — refunded ${green(usdcAmount(state.balance.toString()) + " USDC")}`);
  removeCachedChannel(state.recipient.toBase58());
}
