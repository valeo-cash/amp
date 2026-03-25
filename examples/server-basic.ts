import express from "express";
import { Keypair } from "@solana/web3.js";
import { AMP } from "@valeo/amp-server";

const app = express();
app.use(express.json());

const serverKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SERVER_KEYPAIR!))
);

app.use(
  AMP.middleware({
    wallet: serverKeypair,
    pricing: {
      mode: "per-call",
      rate: "1000", // 0.001 USDC per call
      token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      minDeposit: "1000000", // 1 USDC minimum deposit
    },
    settlement: {
      interval: 3600, // settle every hour
    },
  })
);

app.get("/v1/data", (req, res) => {
  res.json({
    result: "Hello from an AMP-protected endpoint",
    channel: req.amp.channel.address.toBase58(),
    balance: req.amp.channel.balance.toString(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AMP server listening on port ${PORT}`);
});
