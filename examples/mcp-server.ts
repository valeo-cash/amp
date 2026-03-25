import { Keypair } from "@solana/web3.js";
import { AMPMcpServer } from "@valeo/amp-server/mcp";

const serverKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SERVER_KEYPAIR!))
);

const server = new AMPMcpServer({
  wallet: serverKeypair,
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",

  tools: {
    generate_image: {
      description: "Generate an image from a text prompt",
      pricing: { mode: "per-call", rate: "50000" }, // 0.05 USDC per call
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Image generation prompt" },
          size: { type: "string", enum: ["256", "512", "1024"], default: "512" },
        },
        required: ["prompt"],
      },
      handler: async (args, amp) => {
        console.log(
          `[generate_image] channel=${amp.channel} seq=${amp.seq} balance=${amp.balance}`
        );
        const imageUrl = await generateImage(args.prompt, args.size);
        return { image_url: imageUrl };
      },
    },

    search_web: {
      description: "Search the web and return results",
      pricing: { mode: "per-call", rate: "5000" }, // 0.005 USDC per call
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", default: 10 },
        },
        required: ["query"],
      },
      handler: async (args, amp) => {
        const results = await searchWeb(args.query, args.limit);
        return { results };
      },
    },

    stream_data: {
      description: "Stream real-time data",
      pricing: { mode: "per-second", rate: "1000" }, // 0.001 USDC per second
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string" },
          duration: { type: "number", description: "Duration in seconds" },
        },
        required: ["topic"],
      },
      handler: async (args, amp) => {
        const data = await streamData(args.topic, args.duration ?? 60);
        return { data };
      },
    },
  },
});

async function generateImage(prompt: string, size?: string): Promise<string> {
  return `https://images.example.com/${encodeURIComponent(prompt)}?size=${size ?? "512"}`;
}

async function searchWeb(
  query: string,
  limit: number
): Promise<{ title: string; url: string }[]> {
  return Array.from({ length: limit }, (_, i) => ({
    title: `Result ${i + 1} for "${query}"`,
    url: `https://example.com/result/${i + 1}`,
  }));
}

async function streamData(
  topic: string,
  durationSec: number
): Promise<{ events: number }> {
  return { events: durationSec * 10 };
}

server.listen();
