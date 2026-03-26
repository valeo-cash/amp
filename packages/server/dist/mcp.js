"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMPMcpServer = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const amp_core_1 = require("@valeo/amp-core");
const validator_1 = require("./validator");
const meter_1 = require("./meter");
const settler_1 = require("./settler");
/**
 * AMP-enabled MCP server.
 *
 * Wraps MCP tool definitions with per-tool pricing. Agents must open a channel
 * and pass AMP credentials in the `_amp` parameter of tool calls.
 */
class AMPMcpServer {
    config;
    cache;
    meters = new Map();
    settler;
    program;
    constructor(config) {
        this.config = config;
        this.cache = new validator_1.ChannelStateCache();
        const provider = new anchor_1.AnchorProvider(config.connection, new anchor_1.Wallet(config.wallet), { commitment: "confirmed" });
        this.program = new anchor_1.Program(require("../../target/idl/amp_channel.json"), provider);
        for (const [name, tool] of Object.entries(config.tools)) {
            this.meters.set(name, new meter_1.Meter(tool.pricing));
        }
        const defaultPricing = Object.values(config.tools)[0]?.pricing;
        if (defaultPricing) {
            const combinedMeter = new meter_1.Meter(defaultPricing);
            this.settler = new settler_1.Settler(config.connection, this.program, config.wallet, combinedMeter, config.settleInterval ?? defaultPricing.settleInterval);
        }
        else {
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
    async handleRequest(jsonRpcRequest) {
        const { method, params, id } = jsonRpcRequest;
        if (method === "amp/pricing") {
            return {
                jsonrpc: "2.0",
                id,
                result: {
                    amp_version: amp_core_1.AMP_VERSION,
                    recipient: this.config.wallet.publicKey.toBase58(),
                    program_id: (this.config.programId ?? amp_core_1.AMP_PROGRAM_ID).toBase58(),
                    network: this.config.network ?? "solana:mainnet-beta",
                    pricing: {
                        tools: Object.fromEntries(Object.entries(this.config.tools).map(([name, tool]) => [
                            name,
                            tool.pricing,
                        ])),
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
            const toolName = params?.name;
            const args = params?.arguments ?? {};
            const ampCreds = params?._amp;
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
                            program_id: (this.config.programId ?? amp_core_1.AMP_PROGRAM_ID).toBase58(),
                        },
                    },
                };
            }
            const channelPDA = new web3_js_1.PublicKey(ampCreds.channel);
            const validation = await (0, validator_1.validateRequest)(channelPDA, ampCreds.seq, ampCreds.sig, this.program, this.cache);
            if (!validation.valid || !validation.context) {
                const err = new amp_core_1.AmpError(validation.error);
                return {
                    jsonrpc: "2.0",
                    id,
                    error: { code: -32602, message: err.message, data: err.toJSON() },
                };
            }
            const meter = this.meters.get(toolName);
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
exports.AMPMcpServer = AMPMcpServer;
//# sourceMappingURL=mcp.js.map