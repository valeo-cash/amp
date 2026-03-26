import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  AmpPricingManifest,
  PricingConfig,
  AMP_PROGRAM_ID,
} from "@valeo/amp-core";
import { AMPClientConfig } from "./types";
import { ChannelManager } from "./channel-manager";

interface ToolInfo {
  name: string;
  description?: string;
  pricing: Partial<PricingConfig>;
  inputSchema?: Record<string, unknown>;
}

/**
 * AMP-enabled MCP client.
 *
 * Connects to MCP servers, discovers per-tool pricing, opens channels,
 * and calls paid tools with automatic credential management.
 *
 * @example
 * ```ts
 * const client = new AMPMcpClient({ wallet, connection, budget: 5.0 });
 * await client.connect("http://localhost:3000/mcp");
 * const result = await client.callTool("generate_image", { prompt: "cat" });
 * await client.close();
 * ```
 */
export class AMPMcpClient {
  private config: AMPClientConfig;
  private channelManager: ChannelManager;
  private serverUrl: string | null = null;
  private tools = new Map<string, ToolInfo>();
  private pricing: AmpPricingManifest | null = null;
  private channelPDA: PublicKey | null = null;
  private mint: PublicKey;

  constructor(config: AMPClientConfig) {
    this.config = config;
    this.mint = resolveToken(config.token);
    this.channelManager = new ChannelManager(
      config.wallet,
      config.connection,
      config.programId ?? AMP_PROGRAM_ID
    );
  }

  /**
   * Connect to an AMP-enabled MCP server.
   * Discovers pricing via the `amp/pricing` JSON-RPC method.
   *
   * @param transport - Server URL (e.g., "http://localhost:3000/mcp").
   *   `stdio://` transport is not yet implemented.
   */
  async connect(transport: string): Promise<void> {
    if (transport.startsWith("stdio://")) {
      throw new Error(
        "stdio transport is not yet implemented. Use an HTTP endpoint instead."
      );
    }

    this.serverUrl = transport;

    const pricingResponse = await this.sendJsonRpc("amp/pricing", {});
    const result = pricingResponse.result as AmpPricingManifest;
    this.pricing = result;

    const toolsResponse = await this.sendJsonRpc("tools/list", {});
    const toolsList = (toolsResponse.result as { tools: ToolInfo[] }).tools;
    this.tools.clear();
    for (const tool of toolsList) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * List available tools and their pricing.
   */
  listTools(): ToolInfo[] {
    return Array.from(this.tools.values());
  }

  /**
   * Call a paid MCP tool.
   *
   * Automatically opens a channel on first call and attaches
   * `_amp` credentials to the JSON-RPC request.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.serverUrl || !this.pricing) {
      throw new Error("Not connected. Call connect() first.");
    }

    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}. Available: ${Array.from(this.tools.keys()).join(", ")}`);
    }

    if (!this.channelPDA) {
      this.channelPDA = await this.channelManager.openChannel(
        this.serverUrl,
        this.pricing,
        this.config.budget,
        this.mint,
        this.config.settleInterval ?? 3600
      );
    }

    const { seq, sig } = this.channelManager.getNextSeqAndSig(this.channelPDA);

    const response = await this.sendJsonRpc("tools/call", {
      name,
      arguments: args,
      _amp: {
        channel: this.channelPDA.toBase58(),
        seq,
        sig,
      },
    });

    if (response.error) {
      throw new Error(
        `MCP tool error: ${response.error.message ?? JSON.stringify(response.error)}`
      );
    }

    return response.result;
  }

  /** Close the connection and all channels, recovering remaining funds. */
  async close(): Promise<void> {
    await this.channelManager.closeAllChannels();
    this.serverUrl = null;
    this.pricing = null;
    this.channelPDA = null;
    this.tools.clear();
  }

  private async sendJsonRpc(
    method: string,
    params: Record<string, unknown>
  ): Promise<{ result?: unknown; error?: { code: number; message: string; data?: unknown } }> {
    if (!this.serverUrl) {
      throw new Error("Not connected.");
    }

    const body = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: Date.now(),
    });

    const res = await globalThis.fetch(this.serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    return res.json() as Promise<{ result?: unknown; error?: { code: number; message: string; data?: unknown } }>;
  }
}

function resolveToken(token?: string | PublicKey): PublicKey {
  if (!token || token === "USDC") {
    return new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  }
  if (typeof token === "string") return new PublicKey(token);
  return token;
}
