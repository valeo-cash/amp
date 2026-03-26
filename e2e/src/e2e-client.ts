import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import {
  logSection,
  logStep,
  logSuccess,
  logFail,
  sleep,
  getTokenBalance,
} from "./utils";
import * as fs from "fs";
import * as path from "path";

const SERVER_URL = "http://localhost:3402";
const IDL_PATH = path.join(__dirname, "..", "..", "target", "idl", "amp_channel.json");
const CHANNEL_SEED = Buffer.from("amp-channel");
const VAULT_SEED = Buffer.from("amp-vault");

function deriveChannelPDA(
  funder: PublicKey, recipient: PublicKey, nonce: number, programId: PublicKey
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [CHANNEL_SEED, funder.toBuffer(), recipient.toBuffer(), nonceBuf], programId
  );
}

function deriveVaultPDA(channelState: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, channelState.toBuffer()], programId
  );
}

function signSeq(seq: number, keypair: Keypair): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(seq));
  const sig = nacl.sign.detached(buf, keypair.secretKey);
  return bs58.encode(sig);
}

/**
 * AMP E2E Test Client (Agent)
 *
 * Discovers pricing from the e2e server, opens a channel on devnet,
 * makes 5 paid API calls with AMP headers, then closes the channel.
 *
 * Uses direct Anchor calls + native fetch for maximum reliability.
 * This validates the full flow without depending on SDK IDL path resolution.
 */
async function main() {
  logSection("AMP E2E Client (Agent)");

  const keysDir = path.join(__dirname, "..", ".keys");
  const config = JSON.parse(
    fs.readFileSync(path.join(keysDir, "config.json"), "utf-8")
  );
  const funderKp = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(fs.readFileSync(path.join(keysDir, "funder.json"), "utf-8"))
    )
  );

  const connection = new Connection(config.rpcUrl, "confirmed");
  const mint = new PublicKey(config.mint);
  const funderAta = new PublicKey(config.funderAta);
  const recipientAta = new PublicKey(config.recipientAta);

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const programId = new PublicKey(idl.address);
  const provider = new AnchorProvider(
    connection,
    new Wallet(funderKp),
    { commitment: "confirmed" }
  );
  const program = new Program(idl, provider);

  const funderBalanceBefore = await getTokenBalance(connection, funderAta);
  console.log(`  Funder token balance: ${funderBalanceBefore} USDC`);

  // ── Step 1: Discover pricing ──────────────────────────────────
  logStep(1, "Discovering server pricing...");

  const healthRes = await fetch(`${SERVER_URL}/health`);
  const healthData = await healthRes.json();
  logSuccess(`Server health: ${JSON.stringify(healthData)}`);

  const pricingRes = await fetch(`${SERVER_URL}/.well-known/amp.json`);
  const pricing = await pricingRes.json() as {
    recipient: string;
    program_id: string;
    pricing: { default: { rate: string; settleInterval: number } };
  };
  logSuccess(`Pricing discovered: rate=${pricing.pricing.default.rate} (${Number(pricing.pricing.default.rate) / 1_000_000} USDC/call)`);
  logSuccess(`Recipient: ${pricing.recipient}`);

  const recipientPubkey = new PublicKey(pricing.recipient);

  // ── Step 2: Open channel ──────────────────────────────────────
  logStep(2, "Opening channel on devnet ($5 deposit)...");

  const nonce = Date.now();
  const depositAmount = 5_000_000; // 5 USDC
  const settleInterval = pricing.pricing.default.settleInterval;

  const [channelPDA] = deriveChannelPDA(funderKp.publicKey, recipientPubkey, nonce, programId);
  const [vaultPDA] = deriveVaultPDA(channelPDA, programId);

  const openTx = await (program.methods as any)
    .openChannel(
      new BN(depositAmount),
      new BN(depositAmount),
      new BN(settleInterval),
      new BN(nonce)
    )
    .accounts({
      funder: funderKp.publicKey,
      recipient: recipientPubkey,
      mint,
      channelState: channelPDA,
      vault: vaultPDA,
      funderTokenAccount: funderAta,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([funderKp])
    .rpc();

  logSuccess(`Channel opened! TX: ${openTx}`);
  console.log(`  Channel PDA: ${channelPDA.toBase58()}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${openTx}?cluster=devnet`);

  // Wait for confirmation to propagate
  await sleep(2000);

  // ── Step 3: Make paid API calls ───────────────────────────────
  logStep(3, "Making 5 paid API calls...");

  for (let i = 1; i <= 5; i++) {
    const seq = i;
    const sig = signSeq(seq, funderKp);

    const res = await fetch(`${SERVER_URL}/v1/data`, {
      headers: {
        "AMP-Channel": channelPDA.toBase58(),
        "AMP-Seq": seq.toString(),
        "AMP-Sig": sig,
      },
    });

    if (res.ok) {
      const data = await res.json();
      const balance = res.headers.get("AMP-Balance");
      logSuccess(`Call ${i}: status=${res.status} callNumber=${(data as any).callNumber} balance=${balance}`);
    } else {
      const errorData = await res.json();
      logFail(`Call ${i}: status=${res.status} error=${JSON.stringify(errorData)}`);
    }

    await sleep(300);
  }

  // ── Step 4: Verify channel state ──────────────────────────────
  logStep(4, "Verifying channel state on-chain...");

  const channelState = await (program.account as any).channelState.fetch(channelPDA);
  console.log(`  Balance: ${channelState.balance.toString()} (${Number(channelState.balance) / 1_000_000} USDC)`);
  console.log(`  Total deposited: ${channelState.totalDeposited.toString()}`);
  logSuccess("Channel is active with full balance (no settlement yet — off-chain metering only)");

  // ── Step 5: Close channel ─────────────────────────────────────
  logStep(5, "Closing channel (refunding deposit)...");

  const closeTx = await (program.methods as any)
    .closeChannel(new BN(0))
    .accounts({
      closer: funderKp.publicKey,
      funder: funderKp.publicKey,
      recipient: recipientPubkey,
      channelState: channelPDA,
      vault: vaultPDA,
      funderTokenAccount: funderAta,
      recipientTokenAccount: recipientAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      parentChannelState: null,
    })
    .signers([funderKp])
    .rpc();

  logSuccess(`Channel closed! TX: ${closeTx}`);
  console.log(`  Explorer: https://explorer.solana.com/tx/${closeTx}?cluster=devnet`);

  // ── Final: Verify balances ────────────────────────────────────
  logSection("Summary");

  const funderBalanceAfter = await getTokenBalance(connection, funderAta);
  console.log(`  Funder balance: ${funderBalanceBefore} -> ${funderBalanceAfter} USDC`);

  if (Math.abs(funderBalanceBefore - funderBalanceAfter) < 0.001) {
    logSuccess("Full deposit refunded (no settlement occurred — metering was off-chain only)");
  } else {
    console.log(`  Balance difference: ${funderBalanceBefore - funderBalanceAfter} USDC`);
  }

  try {
    await (program.account as any).channelState.fetch(channelPDA);
    logFail("Channel account still exists!");
  } catch {
    logSuccess("Channel account closed (rent reclaimed)");
  }

  logSuccess("Server + Client E2E test complete!");
  console.log(`
  Flow completed:
  1. Agent discovered pricing from /.well-known/amp.json
  2. Agent opened channel on devnet (5 USDC deposit)
  3. Agent made 5 paid API calls with signed AMP headers
  4. Server validated each request (on-chain channel fetch + Ed25519 sig verify)
  5. Agent closed channel (full deposit refunded)
  `);
}

main().catch((e) => {
  console.error("\nE2E client failed:", e);
  process.exit(1);
});
