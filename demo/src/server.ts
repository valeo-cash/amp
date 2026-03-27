import express from "express";
import cors from "cors";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  transfer as splTransfer,
} from "@solana/spl-token";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import * as path from "path";

const PORT = parseInt(process.env.PORT || "3402", 10);
const RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const IDL = require(path.join(__dirname, "..", "idl", "amp_channel.json"));
const DEVNET_PROGRAM_ID = "2KQCaQ9j8YtewZ4QjmDfnsVANZXLBcPSYFhAj2eUNaPP";
const PROGRAM_ID = new PublicKey(process.env.AMP_PROGRAM_ID || DEVNET_PROGRAM_ID);
// Override IDL address for devnet
IDL.address = PROGRAM_ID.toBase58();
const CHANNEL_SEED = Buffer.from("amp-channel");
const VAULT_SEED = Buffer.from("amp-vault");

// Faucet wallet loaded from env or e2e keys
let FAUCET: Keypair;
let MINT: PublicKey;
let FAUCET_ATA: PublicKey;
let RECIPIENT: Keypair;
let RECIPIENT_ATA: PublicKey;

const ratePerCall = 1000; // 0.001 USDC
const depositAmount = 500_000; // 0.50 USDC

// Rate limiter: IP -> timestamps
const rateLimits = new Map<string, number[]>();
const MAX_PER_HOUR = 10;

function deriveChannel(funder: PublicKey, recipient: PublicKey, nonce: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync([CHANNEL_SEED, funder.toBuffer(), recipient.toBuffer(), buf], PROGRAM_ID);
}

function deriveVault(channel: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, channel.toBuffer()], PROGRAM_ID);
}

function trunc(s: string): string {
  return s.length > 12 ? s.slice(0, 8) + "..." : s;
}

async function loadKeys() {
  if (process.env.DEMO_FAUCET_KEY) {
    FAUCET = Keypair.fromSecretKey(bs58.decode(process.env.DEMO_FAUCET_KEY));
  } else {
    const fs = require("fs");
    const keysDir = path.join(__dirname, "..", "..", "e2e", ".keys");
    FAUCET = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(keysDir, "funder.json"), "utf-8"))));
    const config = JSON.parse(fs.readFileSync(path.join(keysDir, "config.json"), "utf-8"));
    MINT = new PublicKey(config.mint);
    FAUCET_ATA = new PublicKey(config.funderAta);
    RECIPIENT = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(keysDir, "recipient.json"), "utf-8"))));
    RECIPIENT_ATA = new PublicKey(config.recipientAta);
    return;
  }
  MINT = new PublicKey(process.env.DEMO_MINT!);
  const conn = new Connection(RPC, "confirmed");
  const faucetAtaAcct = await getOrCreateAssociatedTokenAccount(conn, FAUCET, MINT, FAUCET.publicKey);
  FAUCET_ATA = faucetAtaAcct.address;
  RECIPIENT = Keypair.generate();
  const recipientAtaAcct = await getOrCreateAssociatedTokenAccount(conn, FAUCET, MINT, RECIPIENT.publicKey);
  RECIPIENT_ATA = recipientAtaAcct.address;
}

async function main() {
  await loadKeys();
  const conn = new Connection(RPC, "confirmed");
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Pricing manifest
  app.get("/.well-known/amp.json", (_req, res) => {
    res.json({
      amp_version: "1.0",
      recipient: RECIPIENT.publicKey.toBase58(),
      program_id: PROGRAM_ID.toBase58(),
      network: "solana:devnet",
      pricing: {
        default: {
          mode: "per-call",
          rate: ratePerCall.toString(),
          token: MINT.toBase58(),
          min_deposit: depositAmount.toString(),
          settle_interval: 60,
        },
      },
    });
  });

  // AMP-protected demo endpoint
  app.get("/api/demo/data", (req, res) => {
    const ch = req.headers["amp-channel"] as string;
    const seq = req.headers["amp-seq"] as string;
    const sig = req.headers["amp-sig"] as string;
    if (!ch || !seq || !sig) {
      res.status(402).json({ error: "AMP_NO_CHANNEL" });
      return;
    }
    // Verify signature
    const seqBuf = Buffer.alloc(8);
    seqBuf.writeBigUInt64LE(BigInt(parseInt(seq)));
    // We trust the demo flow here since it's our own server
    res.json({
      model: "gpt-4",
      prompt: "What is AMP?",
      tokens: 127,
      result: "AMP is a Solana-native protocol for persistent payment channels between AI agents and services.",
      timestamp: Date.now(),
      paid: true,
      channel: trunc(ch),
      cost: "$" + (ratePerCall / 1_000_000).toFixed(3),
    });
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Live demo SSE endpoint
  app.get("/api/demo/start", async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const history = rateLimits.get(ip) || [];
    const recent = history.filter((t) => now - t < 3600_000);
    if (recent.length >= MAX_PER_HOUR) {
      res.status(429).json({ error: "Rate limited. Try again later." });
      return;
    }
    recent.push(now);
    rateLimits.set(ip, recent);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (event: string, data: Record<string, unknown>) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Step 1: Create wallet
      send("step", { step: 1, label: "Creating ephemeral wallet...", status: "pending" });
      const demoWallet = Keypair.generate();
      send("step", { step: 1, label: `Wallet: ${trunc(demoWallet.publicKey.toBase58())}`, status: "done" });

      // Step 2: Fund wallet with SOL and test USDC
      send("step", { step: 2, label: "Funding from demo faucet...", status: "pending" });
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: FAUCET.publicKey,
          toPubkey: demoWallet.publicKey,
          lamports: Math.round(0.01 * LAMPORTS_PER_SOL),
        })
      );
      await sendAndConfirmTransaction(conn, fundTx, [FAUCET]);
      const faucetAtaAddress = process.env.DEMO_FAUCET_ATA
        ? new PublicKey(process.env.DEMO_FAUCET_ATA)
        : (await getOrCreateAssociatedTokenAccount(conn, FAUCET, MINT, FAUCET.publicKey)).address;
      const demoAtaAccount = await getOrCreateAssociatedTokenAccount(conn, FAUCET, MINT, demoWallet.publicKey);
      const demoAta = demoAtaAccount.address;
      await splTransfer(conn, FAUCET, faucetAtaAddress, demoAta, FAUCET, depositAmount);
      send("step", { step: 2, label: `Funded: 0.01 SOL + ${(depositAmount / 1_000_000).toFixed(2)} USDC`, status: "done" });

      // Step 3: Discover pricing
      send("step", { step: 3, label: "Discovering AMP pricing...", status: "pending" });
      send("step", {
        step: 3,
        label: `Pricing: $${(ratePerCall / 1_000_000).toFixed(3)}/call | USDC | devnet`,
        status: "done",
      });

      // Step 4: Open channel
      send("step", { step: 4, label: "Opening channel on Solana devnet...", status: "pending" });
      const nonce = Date.now();
      const [channelPDA] = deriveChannel(demoWallet.publicKey, RECIPIENT.publicKey, nonce);
      const [vaultPDA] = deriveVault(channelPDA);
      const provider = new AnchorProvider(conn, new Wallet(demoWallet), { commitment: "confirmed" });
      const program = new Program(IDL, provider);

      const openTx = await (program.methods as any)
        .openChannel(new BN(depositAmount), new BN(depositAmount), new BN(60), new BN(nonce))
        .accounts({
          funder: demoWallet.publicKey,
          recipient: RECIPIENT.publicKey,
          mint: MINT,
          channelState: channelPDA,
          vault: vaultPDA,
          funderTokenAccount: demoAta,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([demoWallet])
        .rpc();

      send("step", {
        step: 4,
        label: `Channel: ${trunc(channelPDA.toBase58())} | Deposit: ${(depositAmount / 1_000_000).toFixed(2)} USDC`,
        status: "done",
        tx: openTx,
        explorer: `https://explorer.solana.com/tx/${openTx}?cluster=devnet`,
      });

      // Step 5: Make 3 paid requests
      const baseUrl = `http://localhost:${PORT}`;
      for (let i = 1; i <= 3; i++) {
        send("step", { step: 5, label: `Request #${i}...`, status: "pending" });
        const seq = i;
        const seqBuf = Buffer.alloc(8);
        seqBuf.writeBigUInt64LE(BigInt(seq));
        const sig = nacl.sign.detached(seqBuf, demoWallet.secretKey);
        const start = Date.now();
        const r = await fetch(`${baseUrl}/api/demo/data`, {
          headers: {
            "AMP-Channel": channelPDA.toBase58(),
            "AMP-Seq": seq.toString(),
            "AMP-Sig": bs58.encode(sig),
          },
        });
        const latency = Date.now() - start;
        const body = await r.json();
        send("step", {
          step: 5,
          label: `Request #${i} → ${r.status} OK (${latency}ms)`,
          status: "done",
          response: body,
        });
      }

      // Step 6: Close channel
      send("step", { step: 6, label: "Closing channel...", status: "pending" });
      const closeTx = await (program.methods as any)
        .closeChannel(new BN(0))
        .accounts({
          closer: demoWallet.publicKey,
          funder: demoWallet.publicKey,
          recipient: RECIPIENT.publicKey,
          channelState: channelPDA,
          vault: vaultPDA,
          funderTokenAccount: demoAta,
          recipientTokenAccount: RECIPIENT_ATA,
          tokenProgram: TOKEN_PROGRAM_ID,
          parentChannelState: null,
        })
        .signers([demoWallet])
        .rpc();

      const totalSpent = (3 * ratePerCall) / 1_000_000;
      const totalRefunded = depositAmount / 1_000_000 - totalSpent;
      send("step", {
        step: 6,
        label: `Closed. Refunded: ${totalRefunded.toFixed(3)} USDC`,
        status: "done",
        tx: closeTx,
        explorer: `https://explorer.solana.com/tx/${closeTx}?cluster=devnet`,
      });

      send("complete", {
        totalCalls: 3,
        totalTxns: 2,
        totalSpent: totalSpent.toFixed(3),
        totalRefunded: totalRefunded.toFixed(3),
      });
    } catch (err: any) {
      send("error", { message: err.message || String(err) });
    }

    res.end();
  });

  app.listen(PORT, () => {
    console.log(`\n  AMP Demo Server on http://localhost:${PORT}`);
    console.log(`  Faucet:    ${FAUCET.publicKey.toBase58()}`);
    console.log(`  Recipient: ${RECIPIENT.publicKey.toBase58()}`);
    console.log(`  Mint:      ${MINT.toBase58()}`);
    console.log(`  Program:   ${PROGRAM_ID.toBase58()}`);
    console.log(`\n  Endpoints:`);
    console.log(`    GET /api/demo/start     (SSE live demo)`);
    console.log(`    GET /api/demo/data      (AMP-protected)`);
    console.log(`    GET /.well-known/amp.json`);
    console.log(`    GET /health\n`);
  });
}

main().catch(console.error);
