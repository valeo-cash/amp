import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

export const DEVNET_URL = "https://api.devnet.solana.com";

/**
 * Transfer SOL from a funded payer to a recipient.
 * Used instead of airdrop when the devnet faucet is rate-limited.
 */
export async function transferSol(
  connection: Connection,
  payer: Keypair,
  recipient: PublicKey,
  amount: number
): Promise<void> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: amount * LAMPORTS_PER_SOL,
    })
  );
  await sendAndConfirmTransaction(connection, tx, [payer]);
  logStep(0, `Transferred ${amount} SOL to ${recipient.toBase58().slice(0, 8)}...`);
}

export async function airdropSol(
  connection: Connection,
  wallet: PublicKey,
  amount: number = 2
): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      const sig = await connection.requestAirdrop(
        wallet,
        amount * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(sig, "confirmed");
      logStep(0, `Airdropped ${amount} SOL to ${wallet.toBase58().slice(0, 8)}...`);
      return;
    } catch {
      const waitMs = 5000 * (i + 1);
      logStep(0, `Airdrop attempt ${i + 1} failed, retrying in ${waitMs / 1000}s...`);
      await sleep(waitMs);
    }
  }
  throw new Error(`Failed to airdrop SOL to ${wallet.toBase58()}`);
}

export async function createTestMint(
  connection: Connection,
  payer: Keypair
): Promise<PublicKey> {
  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  logStep(0, `Created test mint: ${mint.toBase58()}`);
  return mint;
}

export async function fundTokenAccount(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  amount: number
): Promise<PublicKey> {
  const ata = await createAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner
  );
  if (amount > 0) {
    await mintTo(connection, payer, mint, ata, payer, amount * 1_000_000);
  }
  logStep(0, `Funded ${owner.toBase58().slice(0, 8)}... with ${amount} tokens`);
  return ata;
}

export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<number> {
  const info = await connection.getTokenAccountBalance(tokenAccount);
  return Number(info.value.uiAmount);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function logSection(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

export function logStep(step: number, description: string): void {
  console.log(`  [${step}] ${description}`);
}

export function logSuccess(message: string): void {
  console.log(`  OK: ${message}`);
}

export function logFail(message: string): void {
  console.log(`  FAIL: ${message}`);
}
