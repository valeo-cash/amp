"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchChannel = fetchChannel;
exports.findChannelsByFunder = findChannelsByFunder;
exports.findChannelsByRecipient = findChannelsByRecipient;
exports.isChannelHealthy = isChannelHealthy;
exports.secondsUntilSettlement = secondsUntilSettlement;
exports.deserializeChannel = deserializeChannel;
const types_1 = require("./types");
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fetch and deserialize a ChannelState account from on-chain.
 */
async function fetchChannel(channelPDA, program) {
    try {
        const account = await program.account.channelState.fetch(channelPDA);
        return deserializeChannel(account);
    }
    catch {
        return null;
    }
}
/**
 * Find all channels where the given pubkey is the funder.
 */
async function findChannelsByFunder(program, funder) {
    const accounts = await program.account.channelState.all([
        { memcmp: { offset: 9, bytes: funder.toBase58() } },
    ]);
    return accounts.map((a) => ({
        publicKey: a.publicKey,
        account: deserializeChannel(a.account),
    }));
}
/**
 * Find all channels where the given pubkey is the recipient.
 */
async function findChannelsByRecipient(program, recipient) {
    const accounts = await program.account.channelState.all([
        { memcmp: { offset: 41, bytes: recipient.toBase58() } },
    ]);
    return accounts.map((a) => ({
        publicKey: a.publicKey,
        account: deserializeChannel(a.account),
    }));
}
/** Check if a channel is active and has positive balance. */
function isChannelHealthy(channel) {
    return (channel.status === types_1.ChannelStatus.Active && channel.balance > BigInt(0));
}
/** Calculate seconds until next settlement is allowed. */
function secondsUntilSettlement(channel) {
    const now = Math.floor(Date.now() / 1000);
    const nextSettle = channel.lastSettleTs + channel.settleInterval;
    return Math.max(0, nextSettle - now);
}
function toBigInt(val) {
    if (typeof val === "bigint")
        return val;
    return BigInt(String(val));
}
function toNumber(val) {
    if (typeof val === "number")
        return val;
    if (val && typeof val.toNumber === "function") {
        return val.toNumber();
    }
    return Number(val);
}
/** Deserialize raw Anchor account data into a typed ChannelState. */
function deserializeChannel(raw) {
    return {
        bump: raw.bump,
        funder: raw.funder,
        recipient: raw.recipient,
        mint: raw.mint,
        vault: raw.vault,
        balance: toBigInt(raw.balance),
        totalDeposited: toBigInt(raw.totalDeposited),
        totalConsumed: toBigInt(raw.totalConsumed),
        rateLimit: toBigInt(raw.rateLimit),
        settleInterval: toNumber(raw.settleInterval),
        lastSettleTs: toNumber(raw.lastSettleTs),
        nonce: toBigInt(raw.nonce),
        status: raw.status,
        createdAt: toNumber(raw.createdAt),
        delegate: raw.delegate || null,
        delegateLimit: toBigInt(raw.delegateLimit),
        delegateConsumed: toBigInt(raw.delegateConsumed),
        stratumEnabled: raw.stratumEnabled,
        stratumCycle: toNumber(raw.stratumCycle),
        stratumAuthority: raw.stratumAuthority || null,
        parentChannel: raw.parentChannel || null,
        childChannels: raw.childChannels,
        maxChainDepth: raw.maxChainDepth,
        chainDepth: raw.chainDepth,
    };
}
//# sourceMappingURL=channel.js.map