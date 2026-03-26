import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  fetchChannel,
  deriveVaultPDA,
  CHANNEL_SEED,
  VAULT_SEED,
} from "@valeo/amp-core";
import { Meter } from "./meter";

/**
 * Auto-settlement engine.
 * Periodically settles channels that have accumulated usage
 * by submitting the `settle` instruction to the AMP program.
 */
export class Settler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private settling = false;

  constructor(
    private connection: Connection,
    private program: Program,
    private wallet: Keypair,
    private meter: Meter,
    private intervalSeconds: number
  ) {}

  /** Start the auto-settlement loop. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.settleAll(),
      this.intervalSeconds * 1000
    );
  }

  /** Stop the auto-settlement loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Manually settle a specific channel. Returns the transaction signature. */
  async settleChannel(channelPDA: PublicKey): Promise<string> {
    const key = channelPDA.toBase58();

    const channelState = await fetchChannel(channelPDA, this.program);
    if (!channelState) {
      throw new Error(`Channel not found: ${key}`);
    }

    const proof = this.meter.generateProof(key, this.wallet);
    const [vaultPDA] = deriveVaultPDA(channelPDA, this.program.programId);

    const recipientTokenAccount =
      await this.connection.getTokenAccountsByOwner(this.wallet.publicKey, {
        mint: channelState.mint,
      });

    if (recipientTokenAccount.value.length === 0) {
      throw new Error(
        `No token account found for recipient ${this.wallet.publicKey.toBase58()}`
      );
    }

    const txSig = await this.program.methods
      .settle(new BN(proof.amount))
      .accounts({
        authority: this.wallet.publicKey,
        channelState: channelPDA,
        vault: vaultPDA,
        recipientTokenAccount: recipientTokenAccount.value[0].pubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.wallet])
      .rpc();

    this.meter.resetUsage(key);
    return txSig;
  }

  /** Settle all channels with accumulated usage. */
  async settleAll(): Promise<Map<string, string>> {
    if (this.settling) return new Map();
    this.settling = true;

    const results = new Map<string, string>();
    const channels = this.meter.getChannelsWithUsage();

    for (const channelKey of channels) {
      try {
        const txSig = await this.settleChannel(new PublicKey(channelKey));
        results.set(channelKey, txSig);
      } catch (err) {
        console.error(`AMP: settlement failed for ${channelKey}:`, err);
      }
    }

    this.settling = false;
    return results;
  }
}
