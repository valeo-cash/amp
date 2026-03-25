# AMP — Autonomous Machine Payments

Persistent payment channels for AI agents on Solana.

## Why AMP

- **Persistent channels replace per-request payments.** Open a channel once, consume services freely. No per-call payment latency, no per-call on-chain transactions.
- **Zero per-call friction.** After channel open, requests carry only a channel reference and sequence number. The server verifies off-chain and meters locally.
- **Solana native.** 400ms finality, sub-cent settlement costs, SPL tokens. ~3 on-chain transactions instead of 1,000 for 1,000 API calls.

## Quickstart

**Server (Express):**

```typescript
import { AMP } from "@valeo/amp-server";

app.use(AMP.middleware({ rate: "0.001/call" }));
```

**Client (Agent):**

```typescript
import { AMPClient } from "@valeo/amp-client";

const amp = new AMPClient({
  wallet: agentKeypair,
  budget: 10.0,
  token: "USDC",
});

const res = await amp.fetch("https://api.example.com/v1/data");
```

## Documentation

- [Protocol Specification](SPEC.md) — full technical spec with on-chain architecture, message formats, and transport bindings
- [Protocol Comparison](COMPARISON.md) — AMP vs x402 vs MPP with cost and latency analysis
- [Diagrams](diagrams/) — channel lifecycle, settlement flow, and architecture diagrams
- [Examples](examples/) — TypeScript examples for server and client integration

## Status

**Draft — v0.1**

## License

MIT

## Built by

[Valeo](https://github.com/valeo-cash)
