import { Keypair } from "@solana/web3.js";
import { AMPMcpClient } from "@valeo/amp-client/mcp";

async function main() {
  const agentKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.AGENT_KEYPAIR!))
  );

  const client = new AMPMcpClient({
    wallet: agentKeypair,
    budget: 5.0, // 5 USDC
    token: "USDC",
    rpcUrl: "https://api.mainnet-beta.solana.com",
  });

  // Connect to an AMP-enabled MCP server
  // Discovers pricing via amp/pricing, opens channel automatically
  await client.connect("stdio:///path/to/amp-mcp-server");

  // List available tools and their pricing
  const tools = await client.listTools();
  console.log("Available tools:");
  for (const tool of tools) {
    console.log(`  ${tool.name} — ${tool.pricing.mode} @ ${tool.pricing.rate} units`);
  }

  // Call paid tools — credentials attached automatically
  const image = await client.callTool("generate_image", {
    prompt: "solana logo in neon",
    size: "1024",
  });
  console.log("Image:", image.image_url);

  const searchResults = await client.callTool("search_web", {
    query: "AMP protocol Solana",
    limit: 5,
  });
  console.log(`Search returned ${searchResults.results.length} results`);

  // Check remaining balance
  const balance = await client.getBalance();
  console.log(`Remaining balance: ${balance} units`);

  // Close all channels and reclaim unused deposit
  const recovered = await client.close();
  console.log(`Recovered: ${recovered} units`);
}

main().catch(console.error);
