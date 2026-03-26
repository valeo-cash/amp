import express from "express";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import { logSection, logStep, logSuccess } from "./utils";
import * as fs from "fs";
import * as path from "path";

const PORT = 3402;
const IDL_PATH = path.join(__dirname, "..", "..", "target", "idl", "amp_channel.json");
const PROGRAM_ID = "2KQCaQ9j8YtewZ4QjmDfnsVANZXLBcPSYFhAj2eUNaPP";

interface ChannelCacheEntry {
  funder: PublicKey;
  recipient: PublicKey;
  balance: bigint;
  status: number;
  delegate: PublicKey | null;
  fetchedAt: number;
}

/**
 * AMP E2E Test Server
 *
 * A real Express server that validates AMP channel credentials
 * on devnet, using the deployed amp-channel program.
 *
 * Uses the SDK's validation logic directly (channel fetch, sig verify)
 * instead of the AMP middleware class (which has an IDL path issue in e2e).
 */
async function main() {
  logSection("AMP E2E Test Server");

  const keysDir = path.join(__dirname, "..", ".keys");
  const config = JSON.parse(
    fs.readFileSync(path.join(keysDir, "config.json"), "utf-8")
  );
  const recipientKp = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        fs.readFileSync(path.join(keysDir, "recipient.json"), "utf-8")
      )
    )
  );

  const connection = new Connection(config.rpcUrl, "confirmed");
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const provider = new AnchorProvider(
    connection,
    new Wallet(recipientKp),
    { commitment: "confirmed" }
  );
  const program = new Program(idl, provider);
  const programId = new PublicKey(PROGRAM_ID);

  const pricingManifest = {
    amp_version: "1.0",
    recipient: recipientKp.publicKey.toBase58(),
    program_id: programId.toBase58(),
    network: "solana:devnet",
    pricing: {
      default: {
        mode: "per-call",
        rate: "20000",
        token: config.mint,
        minDeposit: "1000000",
        settleInterval: 60,
      },
    },
  };

  const pricingHeaders = {
    "AMP-Version": "1.0",
    "AMP-Pricing": JSON.stringify(pricingManifest.pricing.default),
    "AMP-Recipient": recipientKp.publicKey.toBase58(),
    "AMP-Program": programId.toBase58(),
    "AMP-Network": "solana:devnet",
  };

  const channelCache = new Map<string, ChannelCacheEntry>();
  const seqTracker = new Map<string, number>();
  let totalCalls = 0;

  const app = express();
  app.use(express.json());

  // /.well-known/amp.json — pricing discovery
  app.get("/.well-known/amp.json", (_req, res) => {
    logStep(0, "Serving pricing manifest");
    res.json(pricingManifest);
  });

  // /health — free endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", amp: true, totalCalls });
  });

  // /v1/data — AMP-protected endpoint
  app.get("/v1/data", async (req, res) => {
    const channelHeader = req.headers["amp-channel"] as string | undefined;
    const seqHeader = req.headers["amp-seq"] as string | undefined;
    const sigHeader = req.headers["amp-sig"] as string | undefined;

    // No AMP headers -> 402
    if (!channelHeader || !seqHeader || !sigHeader) {
      res.status(402).set(pricingHeaders).json({
        error: "AMP_NO_CHANNEL",
        message: "Open a channel to access this endpoint.",
      });
      return;
    }

    let channelPDA: PublicKey;
    try {
      channelPDA = new PublicKey(channelHeader);
    } catch {
      res.status(400).json({ error: "AMP_NO_CHANNEL", message: "Invalid channel PDA." });
      return;
    }

    const seq = parseInt(seqHeader, 10);
    if (isNaN(seq) || seq < 0) {
      res.status(400).json({ error: "AMP_INVALID_SEQ", message: "Invalid sequence number." });
      return;
    }

    // Fetch and cache channel state from devnet
    const key = channelPDA.toBase58();
    let cached = channelCache.get(key);
    const CACHE_TTL = 30_000;
    if (!cached || Date.now() - cached.fetchedAt > CACHE_TTL) {
      try {
        const state = await (program.account as any).channelState.fetch(channelPDA);
        cached = {
          funder: state.funder as PublicKey,
          recipient: state.recipient as PublicKey,
          balance: BigInt(state.balance.toString()),
          status: state.status as number,
          delegate: (state.delegate as PublicKey) || null,
          fetchedAt: Date.now(),
        };
        channelCache.set(key, cached);
      } catch {
        res.status(402).json({ error: "AMP_NO_CHANNEL", message: "Channel not found on-chain." });
        return;
      }
    }

    if (cached.status !== 0) {
      res.status(410).json({ error: "AMP_CLOSED", message: "Channel is closed." });
      return;
    }

    if (cached.balance <= BigInt(0)) {
      res.status(402).json({ error: "AMP_UNDERFUNDED", message: "Channel has no balance." });
      return;
    }

    // Verify Ed25519 signature
    const seqBuf = Buffer.alloc(8);
    seqBuf.writeBigUInt64LE(BigInt(seq));
    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(sigHeader);
    } catch {
      res.status(401).json({ error: "AMP_INVALID_SIG", message: "Invalid signature encoding." });
      return;
    }

    const isFunder = nacl.sign.detached.verify(
      seqBuf, sigBytes, cached.funder.toBytes()
    );
    const isDelegate = cached.delegate !== null && nacl.sign.detached.verify(
      seqBuf, sigBytes, cached.delegate.toBytes()
    );

    if (!isFunder && !isDelegate) {
      res.status(401).json({ error: "AMP_INVALID_SIG", message: "Signature verification failed." });
      return;
    }

    // Replay prevention
    const lastSeq = seqTracker.get(key) ?? 0;
    if (seq <= lastSeq) {
      res.status(400).json({ error: "AMP_INVALID_SEQ", message: "Sequence number not increasing." });
      return;
    }
    seqTracker.set(key, seq);

    totalCalls++;
    logStep(totalCalls, `Request validated | channel=${key.slice(0, 8)}... seq=${seq}`);

    res.set("AMP-Balance", cached.balance.toString()).json({
      message: "Hello from AMP-protected API!",
      timestamp: Date.now(),
      callNumber: totalCalls,
      channel: key,
      seq,
    });
  });

  app.listen(PORT, () => {
    console.log(`\n  AMP E2E Server running on http://localhost:${PORT}`);
    console.log(`  Recipient: ${recipientKp.publicKey.toBase58()}`);
    console.log(`  Program:   ${programId.toBase58()}`);
    console.log(`  Mint:      ${config.mint}`);
    console.log(`  Pricing:   $0.02/call (rate: 20000)`);
    console.log(`  Endpoints:`);
    console.log(`    GET /.well-known/amp.json  (pricing discovery)`);
    console.log(`    GET /health                (free)`);
    console.log(`    GET /v1/data               (AMP-protected)`);
    console.log(`\n  Waiting for agent requests...\n`);
  });
}

main().catch(console.error);
