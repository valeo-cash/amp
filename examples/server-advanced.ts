import express from "express";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AMP, ChannelInfo, SettlementInfo, AMPError } from "@valeo/amp-server";

const app = express();
app.use(express.json());

const serverKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SERVER_KEYPAIR!))
);

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

app.use(
  AMP.middleware({
    wallet: serverKeypair,
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",

    pricing: {
      mode: "per-call",
      rate: "1000", // 0.001 USDC default
      token: USDC_MINT,
      minDeposit: "5000000", // 5 USDC minimum
    },

    routes: {
      "/v1/inference": {
        mode: "per-call",
        rate: "10000", // 0.01 USDC per inference call
      },
      "/v1/stream": {
        mode: "per-second",
        rate: "1000", // 0.001 USDC per second of streaming
      },
      "/v1/embeddings": {
        mode: "per-byte",
        rate: "1", // 0.000001 USDC per byte
      },
    },

    settlement: {
      interval: 1800, // settle every 30 minutes
      threshold: 5000000, // or when 5 USDC accumulated
    },

    onChannelOpen: (channel: ChannelInfo) => {
      console.log(
        `Channel opened: ${channel.address.toBase58()} ` +
          `by ${channel.funder.toBase58()} ` +
          `with ${channel.balance} balance`
      );
    },

    onSettle: (settlement: SettlementInfo) => {
      console.log(
        `Settlement: ${settlement.amount} from channel ` +
          `${settlement.channel.toBase58()} ` +
          `(${settlement.callCount} calls, tx: ${settlement.txSignature})`
      );
    },

    onClose: (channel: ChannelInfo) => {
      console.log(
        `Channel closed: ${channel.address.toBase58()} ` +
          `total consumed: ${channel.totalConsumed}`
      );
    },

    onError: (error: AMPError) => {
      console.error(`AMP error: ${error.code} — ${error.message}`);
    },
  })
);

// Per-call pricing: fixed cost per invocation
app.post("/v1/inference", (req, res) => {
  const { prompt } = req.body;

  res.json({
    result: `Inference result for: ${prompt}`,
    model: "example-model-v1",
    channel: req.amp.channel.address.toBase58(),
    balance: req.amp.channel.balance.toString(),
  });
});

// Per-second pricing: cost accumulates with connection duration
app.get("/v1/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let count = 0;
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ tick: count++, ts: Date.now() })}\n\n`);

    if (count >= 60) {
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on("close", () => clearInterval(interval));
});

// Per-byte pricing: cost scales with response size
app.post("/v1/embeddings", (req, res) => {
  const { texts } = req.body as { texts: string[] };

  const embeddings = texts.map((text: string) => ({
    text,
    embedding: Array.from({ length: 384 }, () => Math.random()),
  }));

  res.json({ embeddings });
});

// Health check (not behind AMP — no payment required)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AMP advanced server listening on port ${PORT}`);
  console.log(`  Inference: POST /v1/inference (0.01 USDC/call)`);
  console.log(`  Stream:    GET  /v1/stream    (0.001 USDC/sec)`);
  console.log(`  Embed:     POST /v1/embeddings (0.000001 USDC/byte)`);
});
