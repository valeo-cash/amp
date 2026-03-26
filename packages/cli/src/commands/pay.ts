import { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import ora from "ora";
import { deriveChannelPDA, deriveVaultPDA } from "@valeo/amp-core";
import { loadWallet } from "../utils/wallet";
import { getConnection, getProgram, getProgramId, getNetworkLabel } from "../utils/connection";
import { loadConfig, cacheChannel, getCachedChannel, removeCachedChannel } from "../utils/config";
import { discoverPricing } from "./discover";
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
  explorerLink,
  usdcAmount,
} from "../utils/display";

export function registerPayCommand(program: Command): void {
  program
    .command("pay <url>")
    .description("Make a paid request (auto channel lifecycle)")
    .option("-d, --data <json>", "Request body (JSON)")
    .option("-X, --method <method>", "HTTP method")
    .option("-H, --header <header>", "Custom header (repeatable)", collect, [])
    .option("--budget <amount>", "Max deposit in USDC", "1.00")
    .option("--keep-open", "Don't close channel after request")
    .option("--channel <pda>", "Use an existing channel")
    .option("-v, --verbose", "Show detailed output")
    .action(async (url: string, opts: any) => {
      try {
        await runPay(url, opts);
      } catch (e: any) {
        fail(e.message || String(e));
        console.log();
        process.exit(1);
      }
    });
}

function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}

async function runPay(url: string, opts: any): Promise<void> {
  const kp = loadWallet();
  const conn = getConnection();
  const prog = getProgram(kp, conn);
  const config = loadConfig();
  const programId = getProgramId();
  const mint = new PublicKey(config.token);
  const budget = parseFloat(opts.budget);
  const depositSmallest = Math.round(budget * 1_000_000);
  const networkLabel = getNetworkLabel();
  const verbose = opts.verbose;

  // 1. Discover pricing
  let spinner = ora("Discovering pricing...").start();
  const pricing = await discoverPricing(url);
  spinner.stop();
  if (!pricing) {
    fail("Could not discover AMP pricing for this URL.");
    return;
  }
  success(`Found ${dim("/.well-known/amp.json")}`);
  const rate = pricing.pricing.default.rate;
  kvLine("", `Rate: $${usdcAmount(rate)}/call │ Token: USDC │ Network: ${networkLabel}`);
  console.log();

  const recipientPubkey = new PublicKey(pricing.recipient);
  let channelPDA: PublicKey;
  let opened = false;
  let cachedSeq = 0;

  // 2. Check for existing channel
  if (opts.channel) {
    channelPDA = new PublicKey(opts.channel);
    const cached = getCachedChannel(pricing.recipient);
    if (cached) cachedSeq = cached.lastSeq;
  } else {
    const cached = getCachedChannel(pricing.recipient);
    if (cached) {
      channelPDA = new PublicKey(cached.pda);
      cachedSeq = cached.lastSeq;
      try {
        await (prog.account as any).channelState.fetch(channelPDA);
        success(`Reusing channel ${cyan(trunc(channelPDA.toBase58()))}`);
      } catch {
        channelPDA = null as any;
        removeCachedChannel(pricing.recipient);
      }
    } else {
      channelPDA = null as any;
    }
  }

  // 3. Open channel if needed
  if (!channelPDA) {
    spinner = ora("Opening channel...").start();
    const nonce = Date.now();
    const [pda] = deriveChannelPDA(kp.publicKey, recipientPubkey, nonce, programId);
    const [vault] = deriveVaultPDA(pda, programId);
    const funderAta = await getAssociatedTokenAddress(mint, kp.publicKey);
    const settleInterval = pricing.pricing.default.settleInterval || 60;

    await (prog.methods as any)
      .openChannel(
        new BN(depositSmallest),
        new BN(depositSmallest),
        new BN(settleInterval),
        new BN(nonce)
      )
      .accounts({
        funder: kp.publicKey,
        recipient: recipientPubkey,
        mint,
        channelState: pda,
        vault,
        funderTokenAccount: funderAta,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([kp])
      .rpc();

    spinner.stop();
    channelPDA = pda;
    opened = true;
    cachedSeq = 0;
    success(`Channel opened: ${cyan(trunc(channelPDA.toBase58()))}`);
    kvLine("", `Deposit: ${green(budget.toFixed(2) + " USDC")}`);

    cacheChannel(pricing.recipient, {
      pda: channelPDA.toBase58(),
      recipient: pricing.recipient,
      nonce,
      lastSeq: 0,
      openedAt: new Date().toISOString(),
    });
  }
  console.log();

  // 4. Sign and make request
  spinner = ora("Making paid request...").start();
  const seq = cachedSeq + 1;
  const seqBuf = Buffer.alloc(8);
  seqBuf.writeBigUInt64LE(BigInt(seq));
  const sig = nacl.sign.detached(seqBuf, kp.secretKey);
  const sigB58 = bs58.encode(sig);

  const method = opts.method || (opts.data ? "POST" : "GET");
  const reqHeaders: Record<string, string> = {
    "AMP-Channel": channelPDA.toBase58(),
    "AMP-Seq": seq.toString(),
    "AMP-Sig": sigB58,
  };
  if (opts.data) reqHeaders["Content-Type"] = "application/json";
  for (const h of opts.header || []) {
    const [k, ...v] = h.split(":");
    reqHeaders[k.trim()] = v.join(":").trim();
  }

  if (verbose) {
    spinner.stop();
    kvLine("", `→ ${method} ${new URL(url).pathname}`);
    kvLine("", `→ AMP-Channel: ${trunc(channelPDA.toBase58())}`);
    kvLine("", `→ AMP-Seq: ${seq}`);
    spinner = ora("Waiting for response...").start();
  }

  const start = Date.now();
  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: opts.data || undefined,
  });
  const elapsed = Date.now() - start;
  spinner.stop();

  if (res.ok) {
    success(`${res.status} OK (${elapsed}ms)`);
  } else {
    fail(`${res.status} ${res.statusText} (${elapsed}ms)`);
  }

  const body = await res.text();
  try {
    const json = JSON.parse(body);
    console.log();
    console.log(dim("  Response:"));
    console.log(dim("  " + JSON.stringify(json, null, 2).split("\n").join("\n  ")));
  } catch {
    console.log(dim("  " + body.slice(0, 500)));
  }

  const balance = res.headers.get("AMP-Balance");
  if (balance) {
    console.log();
    kvLine("Channel balance:", green(usdcAmount(balance) + " USDC"));
    kvLine("Spent:", "$" + usdcAmount(rate));
  }

  // Update cache
  cacheChannel(pricing.recipient, {
    pda: channelPDA.toBase58(),
    recipient: pricing.recipient,
    nonce: 0,
    lastSeq: seq,
    openedAt: new Date().toISOString(),
  });

  // 5. Close channel unless --keep-open
  if (!opts.keepOpen) {
    console.log();
    spinner = ora("Closing channel...").start();
    try {
      const [vault] = deriveVaultPDA(channelPDA, programId);
      const funderAta = await getAssociatedTokenAddress(mint, kp.publicKey);
      const recipientAta = await getAssociatedTokenAddress(mint, recipientPubkey);

      await (prog.methods as any)
        .closeChannel(new BN(0))
        .accounts({
          closer: kp.publicKey,
          funder: kp.publicKey,
          recipient: recipientPubkey,
          channelState: channelPDA,
          vault,
          funderTokenAccount: funderAta,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          parentChannelState: null,
        })
        .signers([kp])
        .rpc();

      spinner.stop();
      success("Channel closed");
      if (balance) kvLine("", `Refunded: ${green(usdcAmount(balance) + " USDC")}`);
      removeCachedChannel(pricing.recipient);
    } catch (e: any) {
      spinner.stop();
      warn("Could not close channel: " + (e.message || e));
    }
  }

  console.log();
  header("Summary");
  kvLine("Total spent:", "$" + usdcAmount(rate));
  kvLine("On-chain txns:", opened ? "2 (open + close)" : "0 (reused channel)");
  console.log();
}
