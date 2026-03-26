import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import {
  ChannelState,
  ChannelStatus,
  AmpErrorCode,
  fetchChannel,
} from "@valeo/amp-core";
import { AMPContext, ChannelCache } from "./types";

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  state: ChannelState;
  fetchedAt: number;
}

/**
 * In-memory channel state cache with TTL-based expiry.
 */
export class ChannelStateCache implements ChannelCache {
  private entries = new Map<string, CacheEntry>();
  private seqTracker = new Map<string, number>();

  get(key: string): ChannelState | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.state;
  }

  set(key: string, value: ChannelState): void {
    this.entries.set(key, { state: value, fetchedAt: Date.now() });
  }

  delete(key: string): void {
    this.entries.delete(key);
    this.seqTracker.delete(key);
  }

  getLastSeq(channelKey: string): number {
    return this.seqTracker.get(channelKey) ?? 0;
  }

  setLastSeq(channelKey: string, seq: number): void {
    this.seqTracker.set(channelKey, seq);
  }
}

/**
 * Verify that an AMP-Sig is a valid Ed25519 signature of AMP-Seq
 * by the given public key.
 */
export function verifyAmpSig(
  seq: number,
  sig: string,
  pubkey: PublicKey
): boolean {
  try {
    const message = Buffer.alloc(8);
    message.writeBigUInt64LE(BigInt(seq));
    const sigBytes = bs58.decode(sig);
    return nacl.sign.detached.verify(message, sigBytes, pubkey.toBytes());
  } catch {
    return false;
  }
}

/**
 * Validate an incoming AMP request.
 *
 * 1. Fetch/cache ChannelState
 * 2. Verify channel is Active
 * 3. Verify balance > 0
 * 4. Verify ed25519 signature of seq by funder (or delegate)
 * 5. Verify seq > last_seen_seq
 */
export async function validateRequest(
  channelPDA: PublicKey,
  seq: number,
  sig: string,
  program: Program,
  cache: ChannelStateCache
): Promise<{
  valid: boolean;
  error?: AmpErrorCode;
  context?: AMPContext;
}> {
  const key = channelPDA.toBase58();

  let channelState: ChannelState | undefined = cache.get(key);
  if (!channelState) {
    channelState = (await fetchChannel(channelPDA, program)) ?? undefined;
    if (!channelState) {
      return { valid: false, error: AmpErrorCode.AMP_NO_CHANNEL };
    }
    cache.set(key, channelState);
  }

  if (channelState.status !== ChannelStatus.Active) {
    return { valid: false, error: AmpErrorCode.AMP_CLOSED };
  }

  if (channelState.balance <= BigInt(0)) {
    return { valid: false, error: AmpErrorCode.AMP_UNDERFUNDED };
  }

  const isFunder = verifyAmpSig(seq, sig, channelState.funder);
  const isDelegate =
    channelState.delegate !== null &&
    verifyAmpSig(seq, sig, channelState.delegate);

  if (!isFunder && !isDelegate) {
    return { valid: false, error: AmpErrorCode.AMP_INVALID_SIG };
  }

  const lastSeq = cache.getLastSeq(key);
  if (seq <= lastSeq) {
    return { valid: false, error: AmpErrorCode.AMP_INVALID_SEQ };
  }

  cache.setLastSeq(key, seq);

  return {
    valid: true,
    context: {
      channel: channelPDA,
      channelState,
      seq,
      balance: channelState.balance,
      isDelegate: !isFunder && isDelegate,
    },
  };
}
