import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  ChannelState,
  AmpPricingManifest,
  OpenChannelOptions,
  USDC_MINT,
  USDC_DECIMALS,
  AMP_PROGRAM_ID,
  deriveChannelPDA,
  deriveVaultPDA,
  fetchChannel,
} from "@valeo/amp-core";
import { AMPClientConfig, FetchOptions, ChannelHandle } from "./types";
import { ChannelManager } from "./channel-manager";
import { discoverPricing } from "./discovery";

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
export class AMPClient {
  private config: Required<
    Pick<AMPClientConfig, "budget" | "network" | "settleInterval">
  > &
    AMPClientConfig;
  private channelManager: ChannelManager;
  private mint: PublicKey;
  private pricingCache = new Map<string, AmpPricingManifest>();

  constructor(config: AMPClientConfig) {
    this.config = {
      network: "solana:mainnet-beta",
      settleInterval: 3600,
      ...config,
    };

    this.mint = resolveToken(config.token);
    this.channelManager = new ChannelManager(
      config.wallet,
      config.connection,
      config.programId ?? AMP_PROGRAM_ID
    );
  }

  /**
   * Fetch a resource from an AMP-enabled endpoint.
   *
   * On first call to a new host, automatically discovers pricing,
   * opens a channel, and attaches AMP credentials. Retries once
   * on 402 (re-discover + new channel) or 410 (channel closed).
   */
  async fetch(url: string, options?: FetchOptions): Promise<AMPResponse> {
    return this.fetchWithRetry(url, options, 0);
  }

  /** Explicitly open a channel with a recipient. */
  async openChannel(opts: OpenChannelOptions): Promise<PublicKey> {
    const mint = opts.mint ?? this.mint;
    const host = opts.recipient.toBase58();

    const manifest: AmpPricingManifest = {
      amp_version: "1.0",
      recipient: opts.recipient.toBase58(),
      program_id: (this.config.programId ?? AMP_PROGRAM_ID).toBase58(),
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

    return this.channelManager.openChannel(
      host,
      manifest,
      opts.deposit,
      mint,
      opts.settleInterval ?? this.config.settleInterval
    );
  }

  /** Top up an existing channel with additional funds (human units). */
  async topUp(channel: PublicKey, amount: number): Promise<string> {
    return this.channelManager.topUp(channel, amount, this.mint);
  }

  /** Close a specific channel. Remaining balance is refunded. */
  async close(channel: PublicKey): Promise<string> {
    return this.channelManager.closeChannel(channel);
  }

  /** Close all open channels and recover remaining funds. */
  async closeAll(): Promise<Map<string, string>> {
    return this.channelManager.closeAllChannels();
  }

  /** Get all active channel handles for this client. */
  getChannels(): Map<string, ChannelHandle> {
    return this.channelManager.getAllHandles();
  }

  /** Get approximate remaining budget across all channels (human units). */
  getRemainingBudget(): number {
    let total = BigInt(0);
    for (const [, handle] of this.channelManager.getAllHandles()) {
      total += handle.balance;
    }
    return Number(total) / 10 ** USDC_DECIMALS;
  }

  private async fetchWithRetry(
    url: string,
    options: FetchOptions | undefined,
    retryCount: number
  ): Promise<AMPResponse> {
    const parsedUrl = new URL(url);
    const host = parsedUrl.host;

    let channelPDA =
      options?.channel ?? this.channelManager.getChannelForHost(host);

    if (!channelPDA) {
      channelPDA = await this.ensureChannel(url, host);
    }

    const { seq, sig } = this.channelManager.getNextSeqAndSig(channelPDA);

    const headers = new globalThis.Headers(
      options?.headers as globalThis.HeadersInit | undefined
    );
    headers.set("AMP-Channel", channelPDA.toBase58());
    headers.set("AMP-Seq", seq.toString());
    headers.set("AMP-Sig", sig);

    const res = await globalThis.fetch(url, { ...options, headers });

    if (res.status === 402 && retryCount < 1) {
      this.pricingCache.delete(host);
      const newChannel = await this.ensureChannel(url, host);
      return this.fetchWithRetry(
        url,
        { ...options, channel: newChannel },
        retryCount + 1
      );
    }

    if (res.status === 410 && retryCount < 1) {
      const newChannel = await this.ensureChannel(url, host);
      return this.fetchWithRetry(
        url,
        { ...options, channel: newChannel },
        retryCount + 1
      );
    }

    const balanceHeader = res.headers.get("AMP-Balance");
    const ampBalance = balanceHeader ? BigInt(balanceHeader) : BigInt(0);

    const handle = this.channelManager.getHandle(channelPDA);
    if (handle && balanceHeader) {
      handle.balance = ampBalance;
    }

    const ampResponse = res as AMPResponse;
    ampResponse.ampBalance = ampBalance;
    ampResponse.ampChannel = channelPDA;
    return ampResponse;
  }

  private async ensureChannel(url: string, host: string): Promise<PublicKey> {
    let pricing = this.pricingCache.get(host);
    if (!pricing) {
      pricing = (await discoverPricing(url)) ?? undefined;
      if (!pricing) {
        throw new Error(
          `AMP: could not discover pricing for ${host}. ` +
            "The server may not support AMP. Tried /.well-known/amp.json and 402 headers."
        );
      }
      this.pricingCache.set(host, pricing);
    }

    const deposit = this.config.defaultDeposit ?? this.config.budget;
    return this.channelManager.openChannel(
      host,
      pricing,
      deposit,
      this.mint,
      this.config.settleInterval
    );
  }
}

function resolveToken(token?: string | PublicKey): PublicKey {
  if (!token || token === "USDC") return USDC_MINT;
  if (typeof token === "string") return new PublicKey(token);
  return token;
}
