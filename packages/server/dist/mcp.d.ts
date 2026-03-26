import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { PricingConfig } from "@valeo/amp-core";
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
export declare class AMPMcpServer {
    private config;
    private cache;
    private meters;
    private settler;
    private program;
    constructor(config: AMPMcpServerConfig);
    /**
     * Handle a JSON-RPC request.
     *
     * - `amp/pricing` → return per-tool pricing manifest
     * - `tools/call` with `_amp` → validate channel, meter, execute handler
     * - `tools/list` → return tool definitions with pricing
     */
    handleRequest(jsonRpcRequest: {
        method: string;
        params?: Record<string, unknown>;
        id?: string | number;
    }): Promise<unknown>;
}
export {};
//# sourceMappingURL=mcp.d.ts.map