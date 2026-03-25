import { Keypair, PublicKey } from "@solana/web3.js";
import { AMPClient } from "@valeo/amp-client";

const API_URL = "https://api.example.com";

async function main() {
  // Primary agent: opens the channel and sets the budget
  const primaryKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.PRIMARY_AGENT_KEYPAIR!))
  );

  // Sub-agent: receives delegated budget
  const subAgentKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.SUB_AGENT_KEYPAIR!))
  );

  // --- Step 1: Primary agent opens a channel ---

  const primaryClient = new AMPClient({
    wallet: primaryKeypair,
    budget: 50.0, // 50 USDC total budget
    token: "USDC",
  });

  // Trigger discovery and channel open by making the first request
  const initialRes = await primaryClient.fetch(`${API_URL}/v1/data`);
  console.log("Primary agent — channel opened");
  console.log("  Balance:", initialRes.ampBalance.toString());
  console.log("  Channel:", initialRes.ampChannel.toBase58());

  // --- Step 2: Delegate 20% of budget to sub-agent ---

  const channelAddress = initialRes.ampChannel;
  const delegateLimit = 10_000_000; // 10 USDC (20% of 50 USDC)

  await primaryClient.delegate(channelAddress, {
    delegate: subAgentKeypair.publicKey,
    limit: delegateLimit,
  });

  console.log(
    `\nDelegated ${delegateLimit} units to ${subAgentKeypair.publicKey.toBase58()}`
  );

  // --- Step 3: Sub-agent consumes using the delegated channel ---

  const subAgentClient = new AMPClient({
    wallet: subAgentKeypair,
    budget: 0, // no own budget — using delegated channel
    token: "USDC",
  });

  // Sub-agent attaches to the existing channel via delegation
  subAgentClient.useChannel(channelAddress);

  for (let i = 0; i < 50; i++) {
    const res = await subAgentClient.fetch(`${API_URL}/v1/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `Sub-agent request ${i}` }),
    });

    if (i % 10 === 0) {
      console.log(`  Sub-agent call ${i} — balance: ${res.ampBalance}`);
    }
  }

  console.log("\nSub-agent finished 50 calls");

  // --- Step 4: Primary agent continues using the same channel ---

  for (let i = 0; i < 20; i++) {
    await primaryClient.fetch(`${API_URL}/v1/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `Primary request ${i}` }),
    });
  }

  console.log("Primary agent finished 20 additional calls");

  // --- Step 5: Close the channel ---

  const recovered = await primaryClient.closeAll();
  console.log(`\nChannel closed — recovered ${recovered} tokens to funder`);
}

main().catch(console.error);
