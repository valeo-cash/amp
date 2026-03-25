import express from "express";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AMP, AMPContext } from "@valeo/amp-server";
import { AMPClient } from "@valeo/amp-client";

// Service B: an inference API that needs GPU compute from Service C
// and data enrichment from Service D to fulfill requests.

const serviceBKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SERVICE_B_KEYPAIR!))
);

const SERVICE_C_PUBKEY = new PublicKey(process.env.SERVICE_C_PUBKEY!);
const SERVICE_D_PUBKEY = new PublicKey(process.env.SERVICE_D_PUBKEY!);

const app = express();
app.use(express.json());

app.use(
  AMP.middleware({
    wallet: serviceBKeypair,
    pricing: {
      mode: "per-call",
      rate: "100000", // 0.10 USDC per call
      token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      minDeposit: "5000000", // 5 USDC minimum
    },
    settlement: { interval: 3600 },
  })
);

app.post("/v1/inference", async (req, res) => {
  const ampCtx: AMPContext = req.amp;
  const { prompt } = req.body;

  // Chain a downstream channel to Service C for GPU compute.
  // Funds come from Agent A's upstream channel, not Service B's wallet.
  const gpuChannel = await ampCtx.chain({
    to: SERVICE_C_PUBKEY,
    amount: 30_000, // 0.03 USDC for GPU compute
    rateLimit: 10_000,
    settleInterval: 3600,
  });

  // Chain another downstream channel to Service D for data
  const dataChannel = await ampCtx.chain({
    to: SERVICE_D_PUBKEY,
    amount: 10_000, // 0.01 USDC for data enrichment
    rateLimit: 10_000,
    settleInterval: 3600,
  });

  // Use downstream channels to call sub-services
  const [gpuResult, dataResult] = await Promise.all([
    gpuChannel.fetch("https://gpu-service.example.com/v1/compute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model: "large" }),
    }),
    dataChannel.fetch("https://data-service.example.com/v1/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: prompt }),
    }),
  ]);

  const inference = await gpuResult.json();
  const enrichment = await dataResult.json();

  res.json({
    result: inference.output,
    sources: enrichment.sources,
    upstream_channel: ampCtx.channel.address.toBase58(),
    upstream_balance: ampCtx.channel.balance.toString(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Service B (chaining) listening on port ${PORT}`);
  console.log(`  Upstream: receives from agents @ 0.10 USDC/call`);
  console.log(`  Downstream: chains to Service C (GPU) and Service D (data)`);
});
