import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  PricingConfig,
  AmpErrorCode,
  AmpError,
  AMP_PROGRAM_ID,
  AMP_VERSION,
  ChannelState,
} from "@valeo/amp-core";
import { ChannelStateCache, validateRequest } from "./validator";
import { Meter } from "./meter";
import { Settler } from "./settler";
import { AMPContext } from "./types";

interface McpToolDefinition {
  description: string;
  pricing: PricingConfig;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ampContext: AMPContext) => Promise<unknown>;
}

interface AMPMcpServerConfig {
  wallet: Keypair;
  connection: Connection;
  tools: Record<string, McpToolDefinition>;
  network?: string;
  programId?: PublicKey;
  settleInterval?: number;
}

/**
 * AMP-enabled MCP server.
 *
 * Wraps MCP tool definitions with per-tool pricing. Agents must open a channel
 * and pass AMP credentials in the `_amp` parameter of tool calls.
 */
export class AMPMcpServer {
  private config: AMPMcpServerConfig;
  private cache: ChannelStateCache;
  private meters = new Map<string, Meter>();
  private settler: Settler;
  private program: Program;

  constructor(config: AMPMcpServerConfig) {
    this.config = config;
    this.cache = new ChannelStateCache();

    const provider = new AnchorProvider(
      config.connection,
      new Wallet(config.wallet),
      { commitment: "confirmed" }
    );

    this.program = new Program(
      require("../../target/idl/amp_channel.json"),
      provider
    );

    for (const [name, tool] of Object.entries(config.tools)) {
      this.meters.set(name, new Meter(tool.pricing));
    }

    const defaultPricing = Object.values(config.tools)[0]?.pricing;
    if (defaultPricing) {
      const combinedMeter = new Meter(defaultPricing);
      this.settler = new Settler(
        config.connection,
        this.program,
        config.wallet,
        combinedMeter,
        config.settleInterval ?? defaultPricing.settleInterval
      );
    } else {
      throw new Error("AMPMcpServer requires at least one tool definition");
    }
  }

  /**
   * Handle a JSON-RPC request.
   *
   * - `amp/pricing` → return per-tool pricing manifest
   * - `tools/call` with `_amp` → validate channel, meter, execute handler
   * - `tools/list` → return tool definitions with pricing
   */
  async handleRequest(jsonRpcRequest: {
    method: string;
    params?: Record<string, unknown>;
    id?: string | number;
  }): Promise<unknown> {
    const { method, params, id } = jsonRpcRequest;

    if (method === "amp/pricing") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          amp_version: AMP_VERSION,
          recipient: this.config.wallet.publicKey.toBase58(),
          program_id: (this.config.programId ?? AMP_PROGRAM_ID).toBase58(),
          network: this.config.network ?? "solana:mainnet-beta",
          pricing: {
            tools: Object.fromEntries(
              Object.entries(this.config.tools).map(([name, tool]) => [
                name,
                tool.pricing,
              ])
            ),
          },
        },
      };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: Object.entries(this.config.tools).map(([name, tool]) => ({
            name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            pricing: tool.pricing,
          })),
        },
      };
    }

    if (method === "tools/call") {
      const toolName = params?.name as string;
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      const ampCreds = params?._amp as
        | { channel: string; seq: number; sig: string }
        | undefined;

      const tool = this.config.tools[toolName];
      if (!tool) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool not found: ${toolName}` },
        };
      }

      if (!ampCreds) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: "Missing _amp credentials. Open a channel first.",
            data: {
              pricing: tool.pricing,
              recipient: this.config.wallet.publicKey.toBase58(),
              program_id: (this.config.programId ?? AMP_PROGRAM_ID).toBase58(),
            },
          },
        };
      }

      const channelPDA = new PublicKey(ampCreds.channel);
      const validation = await validateRequest(
        channelPDA,
        ampCreds.seq,
        ampCreds.sig,
        this.program,
        this.cache
      );

      if (!validation.valid || !validation.context) {
        const err = new AmpError(validation.error!);
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: err.message, data: err.toJSON() },
        };
      }

      const meter = this.meters.get(toolName)!;
      meter.recordCall(ampCreds.channel, ampCreds.seq, toolName);

      const result = await tool.handler(args, validation.context);
      return { jsonrpc: "2.0", id, result };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
}
