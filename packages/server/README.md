# @valeo/amp-server

Server SDK for accepting AMP payments. Express middleware, MCP server, metering, and auto-settlement.

## Installation

```bash
npm install @valeo/amp-server
```

## Quickstart

### One-liner (Express)

```typescript
import { AMP } from "@valeo/amp-server";

app.use(AMP.middleware({ rate: "0.001/call" }));
```

### Full Configuration

```typescript
import { AMP } from "@valeo/amp-server";
import { Keypair, Connection } from "@solana/web3.js";

const amp = new AMP({
  wallet: serverKeypair,
  connection: new Connection("https://api.mainnet-beta.solana.com"),
  pricing: {
    mode: "per-call",
    rate: "1000",
    token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    minDeposit: "1000000",
    settleInterval: 3600,
  },
  routes: {
    "/v1/inference": { mode: "per-call", rate: "10000" },
    "/v1/stream": { mode: "per-second", rate: "1000" },
  },
  settlement: { auto: true, interval: 3600 },
});

app.use(amp.middleware());
```

### MCP Server

```typescript
import { AMPMcpServer } from "@valeo/amp-server";

const server = new AMPMcpServer({
  wallet: serverKeypair,
  connection,
  tools: {
    generate_image: {
      description: "Generate an image",
      pricing: { mode: "per-call", rate: "50000", token: "...", minDeposit: "1000000", settleInterval: 3600 },
      inputSchema: { type: "object", properties: { prompt: { type: "string" } } },
      handler: async (args, amp) => ({ url: "..." }),
    },
  },
});
```

See `examples/server-basic.ts` and `examples/server-advanced.ts` for complete examples.

## License

MIT
