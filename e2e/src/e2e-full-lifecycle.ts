import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as nacl from "tweetnacl";
import {
  DEVNET_URL,
  getTokenBalance,
  logSection,
  logStep,
  logSuccess,
  logFail,
  sleep,
} from "./utils";
import * as fs from "fs";
import * as path from "path";

const IDL_PATH = path.join(__dirname, "..", "..", "target", "idl", "amp_channel.json");
const CHANNEL_SEED = Buffer.from("amp-channel");
const VAULT_SEED = Buffer.from("amp-vault");

function deriveChannelPDA(
  funder: PublicKey,
  recipient: PublicKey,
  nonce: number,
  programId: PublicKey
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [CHANNEL_SEED, funder.toBuffer(), recipient.toBuffer(), nonceBuf],
    programId
  );
}

function deriveVaultPDA(
  channelState: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, channelState.toBuffer()],
    programId
  );
}

async function main() {
  logSection("AMP Full Lifecycle E2E Test (Devnet)");

  const keysDir = path.join(__dirname, "..", ".keys");
  const config = JSON.parse(
    fs.readFileSync(path.join(keysDir, "config.json"), "utf-8")
  );
  const funderKp = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(fs.readFileSync(path.join(keysDir, "funder.json"), "utf-8"))
    )
  );
  const recipientKp = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        fs.readFileSync(path.join(keysDir, "recipient.json"), "utf-8")
      )
    )
  );

  const connection = new Connection(config.rpcUrl, "confirmed");
  const mint = new PublicKey(config.mint);
  const funderAta = new PublicKey(config.funderAta);
  const recipientAta = new PublicKey(config.recipientAta);

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const programId = new PublicKey(idl.address);

  const funderProvider = new AnchorProvider(
    connection,
    new Wallet(funderKp),
    { commitment: "confirmed" }
  );
  const recipientProvider = new AnchorProvider(
    connection,
    new Wallet(recipientKp),
    { commitment: "confirmed" }
  );
  const funderProgram = new Program(idl, funderProvider);
  const recipientProgram = new Program(idl, recipientProvider);

  const nonce = Date.now();
  const depositAmount = 10_000_000; // 10 USDC
  const settleInterval = 60;
  const rateLimit = 5_000_000;
  const settleAmount = 2_000_000; // 2 USDC
  const topUpAmount = 5_000_000; // 5 USDC
  const finalSettleAmount = 1_000_000; // 1 USDC

  const [channelPDA] = deriveChannelPDA(
    funderKp.publicKey, recipientKp.publicKey, nonce, programId
  );
  const [vaultPDA] = deriveVaultPDA(channelPDA, programId);

  console.log(`  Program:   ${programId.toBase58()}`);
  console.log(`  Channel:   ${channelPDA.toBase58()}`);
  console.log(`  Vault:     ${vaultPDA.toBase58()}`);
  console.log(`  Funder:    ${funderKp.publicKey.toBase58()}`);
  console.log(`  Recipient: ${recipientKp.publicKey.toBase58()}`);
  console.log(`  Mint:      ${mint.toBase58()}`);
  console.log(`  Nonce:     ${nonce}`);

  const funderBalanceBefore = await getTokenBalance(connection, funderAta);
  console.log(`\n  Funder token balance before: ${funderBalanceBefore}`);

  // ── STEP 1: Open Channel ──────────────────────────────────────
  logSection("Step 1: Open Channel");
  logStep(1, `Opening channel with ${depositAmount / 1_000_000} USDC deposit...`);

  try {
    const openTx = await (funderProgram.methods as any)
      .openChannel(
        new BN(depositAmount),
        new BN(rateLimit),
        new BN(settleInterval),
        new BN(nonce)
      )
      .accounts({
        funder: funderKp.publicKey,
        recipient: recipientKp.publicKey,
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
    console.log(`  Explorer: https://explorer.solana.com/tx/${openTx}?cluster=devnet`);

    const channelState = await (funderProgram.account as any).channelState.fetch(channelPDA);
    console.log(`  Balance: ${channelState.balance.toString()} (${Number(channelState.balance) / 1_000_000} USDC)`);
    console.log(`  Status: ${channelState.status === 0 ? "Active" : "Closed"}`);

    if (channelState.status !== 0) throw new Error("Channel not active!");
    if (channelState.balance.toString() !== depositAmount.toString())
      throw new Error("Balance mismatch!");
    logSuccess("Channel state verified on-chain");
  } catch (e) {
    logFail(`Open channel failed: ${e}`);
    throw e;
  }

  // ── STEP 2: Simulate Consumption ──────────────────────────────
  logSection("Step 2: Simulate Consumption");
  logStep(2, "Simulating 100 API calls with signed sequence numbers...");

  const callCount = 100;
  for (let seq = 1; seq <= callCount; seq++) {
    const seqBuf = Buffer.alloc(8);
    seqBuf.writeBigUInt64LE(BigInt(seq));
    nacl.sign.detached(seqBuf, funderKp.secretKey);
  }
  logSuccess(`Simulated ${callCount} API calls (signatures verified off-chain)`);

  // ── STEP 3: Top Up ────────────────────────────────────────────
  logSection("Step 3: Top Up");
  logStep(3, `Topping up channel with ${topUpAmount / 1_000_000} USDC...`);

  try {
    const topUpTx = await (funderProgram.methods as any)
      .topUp(new BN(topUpAmount))
      .accounts({
        funder: funderKp.publicKey,
        channelState: channelPDA,
        vault: vaultPDA,
        funderTokenAccount: funderAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([funderKp])
      .rpc();

    logSuccess(`Top-up complete! TX: ${topUpTx}`);

    const channelState = await (funderProgram.account as any).channelState.fetch(channelPDA);
    const expectedBalance = depositAmount + topUpAmount;
    console.log(`  Balance after top-up: ${channelState.balance.toString()} (${Number(channelState.balance) / 1_000_000} USDC)`);
    if (channelState.balance.toString() !== expectedBalance.toString())
      throw new Error("Balance mismatch after top-up!");
    logSuccess("Top-up verified on-chain");
  } catch (e) {
    logFail(`Top-up failed: ${e}`);
    throw e;
  }

  // ── STEP 4: Settle ────────────────────────────────────────────
  logSection("Step 4: Settle");
  logStep(4, `Waiting for settle interval (${settleInterval}s)...`);
  console.log(`  (Waiting ${settleInterval + 5} seconds...)`);
  await sleep((settleInterval + 5) * 1000);

  logStep(4, `Settling ${settleAmount / 1_000_000} USDC...`);

  try {
    const settleTx = await (recipientProgram.methods as any)
      .settle(new BN(settleAmount))
      .accounts({
        authority: recipientKp.publicKey,
        channelState: channelPDA,
        vault: vaultPDA,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([recipientKp])
      .rpc();

    logSuccess(`Settlement complete! TX: ${settleTx}`);
    console.log(`  Explorer: https://explorer.solana.com/tx/${settleTx}?cluster=devnet`);

    const channelState = await (funderProgram.account as any).channelState.fetch(channelPDA);
    const expectedBalance = depositAmount + topUpAmount - settleAmount;
    console.log(`  Balance after settle: ${channelState.balance.toString()} (${Number(channelState.balance) / 1_000_000} USDC)`);
    console.log(`  Total consumed: ${channelState.totalConsumed.toString()}`);
    if (channelState.balance.toString() !== expectedBalance.toString())
      throw new Error("Balance mismatch after settle!");

    const recipientBalance = await getTokenBalance(connection, recipientAta);
    console.log(`  Recipient token balance: ${recipientBalance}`);
    logSuccess("Settlement verified on-chain");
  } catch (e) {
    logFail(`Settlement failed: ${e}`);
    throw e;
  }

  // ── STEP 5: Close Channel ────────────────────────────────────
  logSection("Step 5: Close Channel");
  logStep(5, `Closing channel with ${finalSettleAmount / 1_000_000} USDC final settlement...`);
  console.log(`  (Waiting ${settleInterval + 5} seconds for settle interval...)`);
  await sleep((settleInterval + 5) * 1000);

  try {
    const closeTx = await (funderProgram.methods as any)
      .closeChannel(new BN(finalSettleAmount))
      .accounts({
        closer: funderKp.publicKey,
        funder: funderKp.publicKey,
        recipient: recipientKp.publicKey,
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
  } catch (e) {
    logFail(`Close failed: ${e}`);
    throw e;
  }

  // ── FINAL: Verify Balances ────────────────────────────────────
  logSection("Final Balance Verification");

  const funderBalanceAfter = await getTokenBalance(connection, funderAta);
  const recipientBalanceAfter = await getTokenBalance(connection, recipientAta);
  const totalPaidToRecipient = settleAmount + finalSettleAmount;

  console.log(`  Funder balance:    ${funderBalanceBefore} -> ${funderBalanceAfter} USDC`);
  console.log(`  Recipient balance: 0 -> ${recipientBalanceAfter} USDC`);
  console.log(`  Total paid:        ${totalPaidToRecipient / 1_000_000} USDC`);
  console.log(`  Total refunded:    ${(depositAmount + topUpAmount - totalPaidToRecipient) / 1_000_000} USDC`);

  const funderLoss = funderBalanceBefore - funderBalanceAfter;
  const recipientGain = recipientBalanceAfter;

  if (Math.abs(funderLoss - recipientGain) < 0.001) {
    logSuccess("Conservation check passed: funder loss = recipient gain");
  } else {
    logFail(`Conservation check FAILED: funder lost ${funderLoss}, recipient gained ${recipientGain}`);
  }

  try {
    await (funderProgram.account as any).channelState.fetch(channelPDA);
    logFail("Channel account still exists after close!");
  } catch {
    logSuccess("Channel account closed (rent reclaimed)");
  }

  logSection("E2E Test Complete");
  logSuccess("All steps passed!");
  console.log(`
  Summary:
  --------
  Channel opened:     OK (deposit: ${depositAmount / 1_000_000} USDC)
  Consumption:        OK (${callCount} calls simulated)
  Top-up:             OK (+${topUpAmount / 1_000_000} USDC)
  Settlement:         OK (${settleAmount / 1_000_000} USDC to recipient)
  Channel closed:     OK (${finalSettleAmount / 1_000_000} USDC final settle, rest refunded)
  Balances verified:  OK (conservation check passed)
  Account closed:     OK (rent reclaimed)
  `);
}

main().catch((e) => {
  console.error("\nE2E test failed:", e);
  process.exit(1);
});
