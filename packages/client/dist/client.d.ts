import { PublicKey } from "@solana/web3.js";
import { OpenChannelOptions } from "@valeo/amp-core";
import { AMPClientConfig, FetchOptions, ChannelHandle } from "./types";
/** Extended response with AMP channel metadata. */
export interface AMPResponse extends globalThis.Response {
    /** Remaining channel balance after this request (token smallest unit). */
    ampBalance: bigint;
    /** Channel PDA used for this request. */
    ampChannel: PublicKey;
}
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
export declare class AMPClient {
    private config;
    private channelManager;
    private mint;
    private pricingCache;
    constructor(config: AMPClientConfig);
    /**
     * Fetch a resource from an AMP-enabled endpoint.
     *
     * On first call to a new host, automatically discovers pricing,
     * opens a channel, and attaches AMP credentials. Retries once
     * on 402 (re-discover + new channel) or 410 (channel closed).
     */
    fetch(url: string, options?: FetchOptions): Promise<AMPResponse>;
    /** Explicitly open a channel with a recipient. */
    openChannel(opts: OpenChannelOptions): Promise<PublicKey>;
    /** Top up an existing channel with additional funds (human units). */
    topUp(channel: PublicKey, amount: number): Promise<string>;
    /** Close a specific channel. Remaining balance is refunded. */
    close(channel: PublicKey): Promise<string>;
    /** Close all open channels and recover remaining funds. */
    closeAll(): Promise<Map<string, string>>;
    /** Get all active channel handles for this client. */
    getChannels(): Map<string, ChannelHandle>;
    /** Get approximate remaining budget across all channels (human units). */
    getRemainingBudget(): number;
    private fetchWithRetry;
    private ensureChannel;
}
//# sourceMappingURL=client.d.ts.map