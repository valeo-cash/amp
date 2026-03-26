import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
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
  logSection("AMP Channel Chaining E2E Test");

  const keysDir = path.join(__dirname, "..", ".keys");
  const config = JSON.parse(fs.readFileSync(path.join(keysDir, "config.json"), "utf-8"));
  const agentA = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(keysDir, "funder.json"), "utf-8"))));
  const serviceB = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(keysDir, "recipient.json"), "utf-8"))));
  const serviceC = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(keysDir, "sub-agent.json"), "utf-8"))));

  const connection = new Connection(config.rpcUrl, "confirmed");
  const mint = new PublicKey(config.mint);
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const programId = new PublicKey(idl.address);

  const providerA = new AnchorProvider(connection, new Wallet(agentA), { commitment: "confirmed" });
  const providerB = new AnchorProvider(connection, new Wallet(serviceB), { commitment: "confirmed" });
  const providerC = new AnchorProvider(connection, new Wallet(serviceC), { commitment: "confirmed" });
  const programA = new Program(idl, providerA);
  const programB = new Program(idl, providerB);
  const programC = new Program(idl, providerC);

  const nonce1 = Date.now();
  const nonce2 = Date.now() + 1;

  const [upstreamPDA] = deriveChannelPDA(agentA.publicKey, serviceB.publicKey, nonce1, programId);
  const [upstreamVault] = deriveVaultPDA(upstreamPDA, programId);
  const [downstreamPDA] = deriveChannelPDA(serviceB.publicKey, serviceC.publicKey, nonce2, programId);
  const [downstreamVault] = deriveVaultPDA(downstreamPDA, programId);

  const serviceBata = new PublicKey(config.recipientAta);
  const serviceCata = new PublicKey(config.subAgentAta);

  // 1. Agent A opens upstream channel with Service B ($10)
  logStep(1, "Agent A opens channel with Service B ($10)...");
  await (programA.methods as any)
    .openChannel(new BN(10_000_000), new BN(10_000_000), new BN(60), new BN(nonce1))
    .accounts({
      funder: agentA.publicKey,
      recipient: serviceB.publicKey,
      mint,
      channelState: upstreamPDA,
      vault: upstreamVault,
      funderTokenAccount: new PublicKey(config.funderAta),
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([agentA])
    .rpc();
  logSuccess("Upstream channel opened (Agent A -> Service B)");

  // 2. Service B chains downstream to Service C ($3)
  logStep(2, "Service B chains downstream to Service C ($3)...");
  await (programB.methods as any)
    .chainChannel(new BN(3_000_000), new BN(3_000_000), new BN(60), new BN(nonce2))
    .accounts({
      upstreamRecipient: serviceB.publicKey,
      upstreamChannel: upstreamPDA,
      upstreamVault: upstreamVault,
      downstreamRecipient: serviceC.publicKey,
      mint,
      downstreamChannel: downstreamPDA,
      downstreamVault: downstreamVault,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([serviceB])
    .rpc();
  logSuccess("Downstream channel created (Service B -> Service C)");

  const upstream = await (programA.account as any).channelState.fetch(upstreamPDA);
  console.log(`  Upstream balance: ${Number(upstream.balance) / 1_000_000} USDC (was 10, now 7)`);
  console.log(`  Upstream child_channels: ${upstream.childChannels}`);

  const downstream = await (programA.account as any).channelState.fetch(downstreamPDA);
  console.log(`  Downstream balance: ${Number(downstream.balance) / 1_000_000} USDC`);
  console.log(`  Downstream chain_depth: ${downstream.chainDepth}`);
  console.log(`  Downstream parent: ${downstream.parentChannel?.toBase58().slice(0, 8)}...`);

  // 3. Service C settles downstream ($1)
  logStep(3, "Waiting for settle interval (65s)...");
  await sleep(65_000);

  logStep(3, "Service C settles downstream ($1)...");
  await (programC.methods as any)
    .settle(new BN(1_000_000))
    .accounts({
      authority: serviceC.publicKey,
      channelState: downstreamPDA,
      vault: downstreamVault,
      recipientTokenAccount: serviceCata,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([serviceC])
    .rpc();
  logSuccess("Downstream settled ($1 to Service C)");

  // 4. Close downstream (Service B closes, passing parent for child decrement)
  logStep(4, "Closing downstream channel (waiting 65s)...");
  await sleep(65_000);

  await (programB.methods as any)
    .closeChannel(new BN(0))
    .accounts({
      closer: serviceB.publicKey,
      funder: serviceB.publicKey,
      recipient: serviceC.publicKey,
      channelState: downstreamPDA,
      vault: downstreamVault,
      funderTokenAccount: serviceBata,
      recipientTokenAccount: serviceCata,
      tokenProgram: TOKEN_PROGRAM_ID,
      parentChannelState: upstreamPDA,
    })
    .signers([serviceB])
    .rpc();
  logSuccess("Downstream closed, remaining $2 returned to Service B");

  const upstreamAfter = await (programA.account as any).channelState.fetch(upstreamPDA);
  console.log(`  Upstream child_channels after downstream close: ${upstreamAfter.childChannels}`);

  // 5. Close upstream
  logStep(5, "Closing upstream channel (waiting 65s)...");
  await sleep(65_000);

  await (programA.methods as any)
    .closeChannel(new BN(0))
    .accounts({
      closer: agentA.publicKey,
      funder: agentA.publicKey,
      recipient: serviceB.publicKey,
      channelState: upstreamPDA,
      vault: upstreamVault,
      funderTokenAccount: new PublicKey(config.funderAta),
      recipientTokenAccount: serviceBata,
      tokenProgram: TOKEN_PROGRAM_ID,
      parentChannelState: null,
    })
    .signers([agentA])
    .rpc();
  logSuccess("Upstream closed, remaining $7 returned to Agent A");

  logSection("Channel Chaining Test Complete");
  console.log(`
  Flow:
  Agent A --$10--> Service B --$3--> Service C
                                      settled $1
                               refunded $2 to B
                   refunded $7 to A
  `);
}

main().catch(console.error);
