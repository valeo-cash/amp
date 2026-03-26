import { PricingConfig } from "@valeo/amp-core";
import { AMPClientConfig } from "./types";
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
export declare class AMPMcpClient {
    private config;
    private channelManager;
    private serverUrl;
    private tools;
    private pricing;
    private channelPDA;
    private mint;
    constructor(config: AMPClientConfig);
    /**
     * Connect to an AMP-enabled MCP server.
     * Discovers pricing via the `amp/pricing` JSON-RPC method.
     *
     * @param transport - Server URL (e.g., "http://localhost:3000/mcp").
     *   `stdio://` transport is not yet implemented.
     */
    connect(transport: string): Promise<void>;
    /**
     * List available tools and their pricing.
     */
    listTools(): ToolInfo[];
    /**
     * Call a paid MCP tool.
     *
     * Automatically opens a channel on first call and attaches
     * `_amp` credentials to the JSON-RPC request.
     */
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    /** Close the connection and all channels, recovering remaining funds. */
    close(): Promise<void>;
    private sendJsonRpc;
}
export {};
//# sourceMappingURL=mcp.d.ts.map