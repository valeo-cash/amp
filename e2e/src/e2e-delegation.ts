import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as nacl from "tweetnacl";
import { logSection, logStep, logSuccess, sleep } from "./utils";
import * as fs from "fs";
import * as path from "path";

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

async function main() {
  logSection("AMP Delegation E2E Test");

  const keysDir = path.join(__dirname, "..", ".keys");
  const config = JSON.parse(fs.readFileSync(path.join(keysDir, "config.json"), "utf-8"));
  const funderKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(keysDir, "funder.json"), "utf-8"))));
  const recipientKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(keysDir, "recipient.json"), "utf-8"))));
  const subAgentKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(keysDir, "sub-agent.json"), "utf-8"))));

  const connection = new Connection(config.rpcUrl, "confirmed");
  const mint = new PublicKey(config.mint);
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const programId = new PublicKey(idl.address);

  const provider = new AnchorProvider(connection, new Wallet(funderKp), { commitment: "confirmed" });
  const program = new Program(idl, provider);

  const nonce = Date.now();
  const [channelPDA] = deriveChannelPDA(funderKp.publicKey, recipientKp.publicKey, nonce, programId);
  const [vaultPDA] = deriveVaultPDA(channelPDA, programId);

  // 1. Open channel
  logStep(1, "Opening channel ($5 deposit)...");
  await (program.methods as any)
    .openChannel(new BN(5_000_000), new BN(5_000_000), new BN(60), new BN(nonce))
    .accounts({
      funder: funderKp.publicKey,
      recipient: recipientKp.publicKey,
      mint,
      channelState: channelPDA,
      vault: vaultPDA,
      funderTokenAccount: new PublicKey(config.funderAta),
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([funderKp])
    .rpc();
  logSuccess("Channel opened");

  // 2. Set delegate
  logStep(2, `Delegating $2 to sub-agent ${subAgentKp.publicKey.toBase58().slice(0, 8)}...`);
  await (program.methods as any)
    .setDelegate(subAgentKp.publicKey, new BN(2_000_000))
    .accounts({
      funder: funderKp.publicKey,
      channelState: channelPDA,
    })
    .signers([funderKp])
    .rpc();

  const state = await (program.account as any).channelState.fetch(channelPDA);
  console.log(`  Delegate: ${state.delegate.toBase58()}`);
  console.log(`  Delegate limit: ${state.delegateLimit.toString()} (${Number(state.delegateLimit) / 1_000_000} USDC)`);
  logSuccess("Delegation set on-chain");

  // 3. Sub-agent signs requests (off-chain simulation)
  logStep(3, "Sub-agent signing 10 requests...");
  for (let seq = 1; seq <= 10; seq++) {
    const seqBuf = Buffer.alloc(8);
    seqBuf.writeBigUInt64LE(BigInt(seq));
    nacl.sign.detached(seqBuf, subAgentKp.secretKey);
  }
  logSuccess("10 requests signed by delegate");

  // 4. Close channel
  logStep(4, "Closing channel (waiting for settle interval)...");
  await sleep(65_000);

  await (program.methods as any)
    .closeChannel(new BN(0))
    .accounts({
      closer: funderKp.publicKey,
      funder: funderKp.publicKey,
      recipient: recipientKp.publicKey,
      channelState: channelPDA,
      vault: vaultPDA,
      funderTokenAccount: new PublicKey(config.funderAta),
      recipientTokenAccount: new PublicKey(config.recipientAta),
      tokenProgram: TOKEN_PROGRAM_ID,
      parentChannelState: null,
    })
    .signers([funderKp])
    .rpc();
  logSuccess("Channel closed, funds returned to funder");

  logSection("Delegation Test Complete");
}

main().catch(console.error);
