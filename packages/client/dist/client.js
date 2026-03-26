"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMPClient = void 0;
const web3_js_1 = require("@solana/web3.js");
const amp_core_1 = require("@valeo/amp-core");
const channel_manager_1 = require("./channel-manager");
const discovery_1 = require("./discovery");
/**
 * AMPClient — the agent-facing SDK for consuming AMP-enabled services.
 *
 * Handles pricing discovery, channel opening, credential signing,
 * and automatic retry on 402/410 responses.
 *
 * @example
 * ```ts
 * const amp = new AMPClient({ wallet, connection, budget: 10.00 });
 * const res = await amp.fetch("https://api.example.com/v1/data");
 * console.log(res.ampBalance);
 * await amp.closeAll();
 * ```
 */
class AMPClient {
    config;
    channelManager;
    mint;
    pricingCache = new Map();
    constructor(config) {
        this.config = {
            network: "solana:mainnet-beta",
            settleInterval: 3600,
            ...config,
        };
        this.mint = resolveToken(config.token);
        this.channelManager = new channel_manager_1.ChannelManager(config.wallet, config.connection, config.programId ?? amp_core_1.AMP_PROGRAM_ID);
    }
    /**
     * Fetch a resource from an AMP-enabled endpoint.
     *
     * On first call to a new host, automatically discovers pricing,
     * opens a channel, and attaches AMP credentials. Retries once
     * on 402 (re-discover + new channel) or 410 (channel closed).
     */
    async fetch(url, options) {
        return this.fetchWithRetry(url, options, 0);
    }
    /** Explicitly open a channel with a recipient. */
    async openChannel(opts) {
        const mint = opts.mint ?? this.mint;
        const host = opts.recipient.toBase58();
        const manifest = {
            amp_version: "1.0",
            recipient: opts.recipient.toBase58(),
            program_id: (this.config.programId ?? amp_core_1.AMP_PROGRAM_ID).toBase58(),
            network: this.config.network,
            pricing: {
                default: {
                    mode: "per-call",
                    rate: "1000",
                    token: mint.toBase58(),
                    minDeposit: "1000000",
                    settleInterval: opts.settleInterval ?? this.config.settleInterval,
                },
            },
        };
        return this.channelManager.openChannel(host, manifest, opts.deposit, mint, opts.settleInterval ?? this.config.settleInterval);
    }
    /** Top up an existing channel with additional funds (human units). */
    async topUp(channel, amount) {
        return this.channelManager.topUp(channel, amount, this.mint);
    }
    /** Close a specific channel. Remaining balance is refunded. */
    async close(channel) {
        return this.channelManager.closeChannel(channel);
    }
    /** Close all open channels and recover remaining funds. */
    async closeAll() {
        return this.channelManager.closeAllChannels();
    }
    /** Get all active channel handles for this client. */
    getChannels() {
        return this.channelManager.getAllHandles();
    }
    /** Get approximate remaining budget across all channels (human units). */
    getRemainingBudget() {
        let total = BigInt(0);
        for (const [, handle] of this.channelManager.getAllHandles()) {
            total += handle.balance;
        }
        return Number(total) / 10 ** amp_core_1.USDC_DECIMALS;
    }
    async fetchWithRetry(url, options, retryCount) {
        const parsedUrl = new URL(url);
        const host = parsedUrl.host;
        let channelPDA = options?.channel ?? this.channelManager.getChannelForHost(host);
        if (!channelPDA) {
            channelPDA = await this.ensureChannel(url, host);
        }
        const { seq, sig } = this.channelManager.getNextSeqAndSig(channelPDA);
        const headers = new globalThis.Headers(options?.headers);
        headers.set("AMP-Channel", channelPDA.toBase58());
        headers.set("AMP-Seq", seq.toString());
        headers.set("AMP-Sig", sig);
        const res = await globalThis.fetch(url, { ...options, headers });
        if (res.status === 402 && retryCount < 1) {
            this.pricingCache.delete(host);
            const newChannel = await this.ensureChannel(url, host);
            return this.fetchWithRetry(url, { ...options, channel: newChannel }, retryCount + 1);
        }
        if (res.status === 410 && retryCount < 1) {
            const newChannel = await this.ensureChannel(url, host);
            return this.fetchWithRetry(url, { ...options, channel: newChannel }, retryCount + 1);
        }
        const balanceHeader = res.headers.get("AMP-Balance");
        const ampBalance = balanceHeader ? BigInt(balanceHeader) : BigInt(0);
        const handle = this.channelManager.getHandle(channelPDA);
        if (handle && balanceHeader) {
            handle.balance = ampBalance;
        }
        const ampResponse = res;
        ampResponse.ampBalance = ampBalance;
        ampResponse.ampChannel = channelPDA;
        return ampResponse;
    }
    async ensureChannel(url, host) {
        let pricing = this.pricingCache.get(host);
        if (!pricing) {
            pricing = (await (0, discovery_1.discoverPricing)(url)) ?? undefined;
            if (!pricing) {
                throw new Error(`AMP: could not discover pricing for ${host}. ` +
                    "The server may not support AMP. Tried /.well-known/amp.json and 402 headers.");
            }
            this.pricingCache.set(host, pricing);
        }
        const deposit = this.config.defaultDeposit ?? this.config.budget;
        return this.channelManager.openChannel(host, pricing, deposit, this.mint, this.config.settleInterval);
    }
}
exports.AMPClient = AMPClient;
function resolveToken(token) {
    if (!token || token === "USDC")
        return amp_core_1.USDC_MINT;
    if (typeof token === "string")
        return new web3_js_1.PublicKey(token);
    return token;
}
//# sourceMappingURL=client.js.map