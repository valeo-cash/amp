import { Keypair } from "@solana/web3.js";
import { AMPRegistry, AMPClient } from "@valeo/amp-client";

async function main() {
  const agentKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.AGENT_KEYPAIR!))
  );

  const registry = new AMPRegistry({
    network: "mainnet-beta",
    rpcUrl: "https://api.mainnet-beta.solana.com",
  });

  // Find inference services under $0.01/call with good reputation
  const services = await registry.search({
    category: "inference",
    maxRate: "10000", // 0.01 USDC max
    token: "USDC",
    minReputation: 5000,
    sortBy: "reputation",
  });

  console.log(`Found ${services.length} inference services:\n`);
  for (const svc of services) {
    const rateUsd = Number(svc.rate) / 1_000_000;
    console.log(`  ${svc.endpoint}`);
    console.log(`    Rate: $${rateUsd}/call`);
    console.log(`    Reputation: ${svc.reputation_score}/10000`);
    console.log(`    Total settled: ${svc.total_settled} units`);
    console.log(`    Active channels: ${svc.active_channels}`);
    console.log();
  }

  if (services.length === 0) {
    console.log("No services found matching criteria.");
    return;
  }

  // Open a channel with the highest-reputation service
  const best = services[0];
  console.log(`Opening channel with ${best.endpoint}...`);

  const amp = new AMPClient({
    wallet: agentKeypair,
    budget: 10.0,
    token: "USDC",
  });

  const res = await amp.fetch(`${best.endpoint}/v1/inference`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Explain AMP protocol" }),
  });

  console.log("Response:", await res.json());
  console.log("Channel balance:", res.ampBalance.toString());

  await amp.closeAll();
}

main().catch(console.error);
