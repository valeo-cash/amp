import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { ChannelState, ChannelStatus } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Fetch and deserialize a ChannelState account from on-chain.
 */
export async function fetchChannel(
  channelPDA: PublicKey,
  program: Program
): Promise<ChannelState | null> {
  try {
    const account = await (program.account as any).channelState.fetch(channelPDA);
    return deserializeChannel(account);
  } catch {
    return null;
  }
}

/**
 * Find all channels where the given pubkey is the funder.
 */
export async function findChannelsByFunder(
  program: Program,
  funder: PublicKey
): Promise<{ publicKey: PublicKey; account: ChannelState }[]> {
  const accounts = await (program.account as any).channelState.all([
    { memcmp: { offset: 9, bytes: funder.toBase58() } },
  ]);
  return accounts.map((a: any) => ({
    publicKey: a.publicKey,
    account: deserializeChannel(a.account),
  }));
}

/**
 * Find all channels where the given pubkey is the recipient.
 */
export async function findChannelsByRecipient(
  program: Program,
  recipient: PublicKey
): Promise<{ publicKey: PublicKey; account: ChannelState }[]> {
  const accounts = await (program.account as any).channelState.all([
    { memcmp: { offset: 41, bytes: recipient.toBase58() } },
  ]);
  return accounts.map((a: any) => ({
    publicKey: a.publicKey,
    account: deserializeChannel(a.account),
  }));
}

/** Check if a channel is active and has positive balance. */
export function isChannelHealthy(channel: ChannelState): boolean {
  return (
    channel.status === ChannelStatus.Active && channel.balance > BigInt(0)
  );
}

/** Calculate seconds until next settlement is allowed. */
export function secondsUntilSettlement(channel: ChannelState): number {
  const now = Math.floor(Date.now() / 1000);
  const nextSettle = channel.lastSettleTs + channel.settleInterval;
  return Math.max(0, nextSettle - now);
}

function toBigInt(val: unknown): bigint {
  if (typeof val === "bigint") return val;
  return BigInt(String(val));
}

function toNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (val && typeof (val as { toNumber?: () => number }).toNumber === "function") {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

/** Deserialize raw Anchor account data into a typed ChannelState. */
export function deserializeChannel(raw: Record<string, unknown>): ChannelState {
  return {
    bump: raw.bump as number,
    funder: raw.funder as PublicKey,
    recipient: raw.recipient as PublicKey,
    mint: raw.mint as PublicKey,
    vault: raw.vault as PublicKey,
    balance: toBigInt(raw.balance),
    totalDeposited: toBigInt(raw.totalDeposited),
    totalConsumed: toBigInt(raw.totalConsumed),
    rateLimit: toBigInt(raw.rateLimit),
    settleInterval: toNumber(raw.settleInterval),
    lastSettleTs: toNumber(raw.lastSettleTs),
    nonce: toBigInt(raw.nonce),
    status: raw.status as ChannelStatus,
    createdAt: toNumber(raw.createdAt),
    delegate: (raw.delegate as PublicKey) || null,
    delegateLimit: toBigInt(raw.delegateLimit),
    delegateConsumed: toBigInt(raw.delegateConsumed),
    stratumEnabled: raw.stratumEnabled as boolean,
    stratumCycle: toNumber(raw.stratumCycle),
    stratumAuthority: (raw.stratumAuthority as PublicKey) || null,
    parentChannel: (raw.parentChannel as PublicKey) || null,
    childChannels: raw.childChannels as number,
    maxChainDepth: raw.maxChainDepth as number,
    chainDepth: raw.chainDepth as number,
  };
}
