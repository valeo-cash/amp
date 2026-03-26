import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import {
  deriveChannelPDA,
  deriveVaultPDA,
  AmpPricingManifest,
  ChannelState,
  fetchChannel,
  AMP_PROGRAM_ID,
  USDC_DECIMALS,
} from "@valeo/amp-core";
import { ChannelHandle } from "./types";

/**
 * Internal channel lifecycle manager.
 * Maps hostnames to channel PDAs, tracks sequence counters,
 * and submits on-chain instructions for open/close/top-up.
 */
export class ChannelManager {
  private hostChannels = new Map<string, PublicKey>();
  private seqCounters = new Map<string, number>();
  private channelHandles = new Map<string, ChannelHandle>();
  private nonceCounter = 0;
  private program: Program;

  constructor(
    private wallet: Keypair,
    private connection: Connection,
    private programId: PublicKey = AMP_PROGRAM_ID
  ) {
    const provider = new AnchorProvider(
      connection,
      new Wallet(wallet),
      { commitment: "confirmed" }
    );
    this.program = new Program(
      require("../../../target/idl/amp_channel.json"),
      provider
    );
  }

  /** Check if a channel already exists for a given hostname. */
  getChannelForHost(host: string): PublicKey | undefined {
    return this.hostChannels.get(host);
  }

  /** Get the handle (PDA + metadata) for a channel. */
  getHandle(channelPDA: PublicKey): ChannelHandle | undefined {
    return this.channelHandles.get(channelPDA.toBase58());
  }

  /** Get all active channel handles. */
  getAllHandles(): Map<string, ChannelHandle> {
    return new Map(this.channelHandles);
  }

  /**
   * Open a channel for a host, using pricing from the server's manifest.
   * Returns the channel PDA.
   */
  async openChannel(
    host: string,
    pricing: AmpPricingManifest,
    depositHuman: number,
    mint: PublicKey,
    settleInterval?: number
  ): Promise<PublicKey> {
    const recipient = new PublicKey(pricing.recipient);
    const nonce = this.nonceCounter++;
    const [channelPDA] = deriveChannelPDA(
      this.wallet.publicKey,
      recipient,
      nonce,
      this.programId
    );
    const [vaultPDA] = deriveVaultPDA(channelPDA, this.programId);

    const decimals = USDC_DECIMALS;
    const depositAmount = Math.round(depositHuman * 10 ** decimals);
    const interval =
      settleInterval ?? pricing.pricing.default.settleInterval ?? 3600;
    const rateLimit = depositAmount;

    const funderAta = await getAssociatedTokenAddress(
      mint,
      this.wallet.publicKey
    );

    await this.program.methods
      .openChannel(
        new BN(depositAmount),
        new BN(rateLimit),
        new BN(interval),
        new BN(nonce)
      )
      .accounts({
        funder: this.wallet.publicKey,
        recipient,
        mint,
        channelState: channelPDA,
        vault: vaultPDA,
        funderTokenAccount: funderAta,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.wallet])
      .rpc();

    this.hostChannels.set(host, channelPDA);
    this.seqCounters.set(channelPDA.toBase58(), 0);
    this.channelHandles.set(channelPDA.toBase58(), {
      pda: channelPDA,
      vault: vaultPDA,
      recipient,
      balance: BigInt(depositAmount),
    });

    return channelPDA;
  }

  /**
   * Get the next sequence number and sign it with the wallet keypair.
   * Returns `{ seq, sig }` where sig is base58-encoded Ed25519 signature.
   */
  getNextSeqAndSig(channelPDA: PublicKey): { seq: number; sig: string } {
    const key = channelPDA.toBase58();
    const current = this.seqCounters.get(key) ?? 0;
    const seq = current + 1;
    this.seqCounters.set(key, seq);

    const message = Buffer.alloc(8);
    message.writeBigUInt64LE(BigInt(seq));
    const signature = nacl.sign.detached(message, this.wallet.secretKey);

    return { seq, sig: bs58.encode(signature) };
  }

  /**
   * Top up an existing channel with additional funds.
   * Returns the transaction signature.
   */
  async topUp(
    channelPDA: PublicKey,
    amountHuman: number,
    mint: PublicKey
  ): Promise<string> {
    const amount = Math.round(amountHuman * 10 ** USDC_DECIMALS);
    const [vaultPDA] = deriveVaultPDA(channelPDA, this.programId);
    const funderAta = await getAssociatedTokenAddress(
      mint,
      this.wallet.publicKey
    );

    const txSig = await this.program.methods
      .topUp(new BN(amount))
      .accounts({
        funder: this.wallet.publicKey,
        channelState: channelPDA,
        vault: vaultPDA,
        funderTokenAccount: funderAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([this.wallet])
      .rpc();

    const handle = this.channelHandles.get(channelPDA.toBase58());
    if (handle) {
      handle.balance += BigInt(amount);
    }

    return txSig;
  }

  /**
   * Close a specific channel. Refunds remaining balance to funder.
   * Returns the transaction signature.
   */
  async closeChannel(channelPDA: PublicKey): Promise<string> {
    const channelState = await fetchChannel(channelPDA, this.program);
    if (!channelState) {
      throw new Error(`Channel not found: ${channelPDA.toBase58()}`);
    }

    const [vaultPDA] = deriveVaultPDA(channelPDA, this.programId);
    const funderAta = await getAssociatedTokenAddress(
      channelState.mint,
      this.wallet.publicKey
    );
    const recipientAta = await getAssociatedTokenAddress(
      channelState.mint,
      channelState.recipient
    );

    const txSig = await (this.program.methods as any)
      .closeChannel(new BN(0))
      .accounts({
        closer: this.wallet.publicKey,
        funder: this.wallet.publicKey,
        recipient: channelState.recipient,
        channelState: channelPDA,
        vault: vaultPDA,
        funderTokenAccount: funderAta,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        parentChannelState: null,
      })
      .signers([this.wallet])
      .rpc();

    const key = channelPDA.toBase58();
    this.channelHandles.delete(key);
    this.seqCounters.delete(key);
    for (const [host, pda] of this.hostChannels) {
      if (pda.equals(channelPDA)) {
        this.hostChannels.delete(host);
        break;
      }
    }

    return txSig;
  }

  /**
   * Close all open channels. Returns a map of channel PDA -> tx signature.
   */
  async closeAllChannels(): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const pdas = Array.from(this.channelHandles.keys());

    for (const key of pdas) {
      try {
        const txSig = await this.closeChannel(new PublicKey(key));
        results.set(key, txSig);
      } catch (err) {
        console.error(`AMP: failed to close channel ${key}:`, err);
      }
    }

    return results;
  }
}
