import { Keypair } from "@solana/web3.js";
import { AMPClient } from "@valeo/amp-client";

async function main() {
  const agentKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.AGENT_KEYPAIR!))
  );

  const amp = new AMPClient({
    wallet: agentKeypair,
    budget: 10.0, // 10 USDC total budget
    token: "USDC",
    rpcUrl: "https://api.mainnet-beta.solana.com",
  });

  // First call: discovers pricing, opens channel, then fetches
  const res1 = await amp.fetch("https://api.example.com/v1/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "What is the weather?" }),
  });

  console.log("Response:", await res1.json());
  console.log("Remaining balance:", res1.ampBalance.toString());

  // Subsequent calls reuse the open channel — zero additional on-chain cost
  for (let i = 0; i < 100; i++) {
    const res = await amp.fetch("https://api.example.com/v1/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `Request ${i}` }),
    });

    if (i % 25 === 0) {
      console.log(`Call ${i} — balance: ${res.ampBalance.toString()}`);
    }
  }

  // Close all channels and recover remaining funds
  const recovered = await amp.closeAll();
  console.log("Recovered balance:", recovered.toString());
}

main().catch(console.error);
