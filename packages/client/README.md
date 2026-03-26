# @valeo/amp-client

Client SDK for AI agents consuming AMP-enabled services. Automatic pricing discovery, channel lifecycle, and drop-in `fetch()` replacement.

## Installation

```bash
npm install @valeo/amp-client
```

## Quickstart

```typescript
import { AMPClient } from "@valeo/amp-client";
import { Keypair, Connection } from "@solana/web3.js";

const amp = new AMPClient({
  wallet: agentKeypair,
  connection: new Connection("https://api.mainnet-beta.solana.com"),
  budget: 10.0,
  token: "USDC",
});

// fetch() handles discovery, channel open, and credential signing
const res = await amp.fetch("https://api.example.com/v1/data", {
  method: "POST",
  body: JSON.stringify({ query: "test" }),
});

console.log(res.ampBalance); // remaining channel balance
console.log(await res.json());

// Close all channels and recover remaining funds
await amp.closeAll();
```

### MCP Client

```typescript
import { AMPMcpClient } from "@valeo/amp-client";

const client = new AMPMcpClient({
  wallet: agentKeypair,
  connection,
  budget: 5.0,
});

await client.connect("http://localhost:3000/mcp");

const tools = client.listTools();
const result = await client.callTool("generate_image", { prompt: "a cat" });

await client.close();
```

See `examples/client-basic.ts` and `examples/mcp-client.ts` for complete examples.

## License

MIT
