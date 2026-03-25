# AMP Architecture

System architecture showing the relationship between the client SDK, server middleware, Solana program, and token vault. Off-chain data flows are separated from on-chain flows.

```mermaid
flowchart TB
    subgraph offchain [Off-Chain Layer]
        ClientSDK["Client SDK<br/>(@valeo/amp-client)"]
        ServerMW["Server Middleware<br/>(@valeo/amp-server)"]
        ServiceLogic["Service Logic<br/>(API endpoints)"]
    end

    subgraph onchain [On-Chain Layer — Solana]
        AMPProgram["AMP Program"]
        ChannelPDA["ChannelState PDA"]
        ChannelVault["Channel Vault<br/>(SPL Token Account)"]
        FunderATA["Funder Token Account"]
        RecipientATA["Recipient Token Account"]
    end

    ClientSDK -- "API requests<br/>+ AMP-Channel, AMP-Seq, AMP-Sig" --> ServerMW
    ServerMW -- "Verified request<br/>+ req.amp context" --> ServiceLogic
    ServiceLogic -- "Response data" --> ServerMW
    ServerMW -- "Response<br/>+ AMP-Balance" --> ClientSDK

    ClientSDK -- "open_channel tx<br/>top_up tx<br/>close_channel tx" --> AMPProgram
    ServerMW -- "settle tx<br/>(metering proof)" --> AMPProgram

    AMPProgram -- "read/write" --> ChannelPDA
    AMPProgram -- "token transfers" --> ChannelVault

    FunderATA -- "deposit / top-up" --> ChannelVault
    ChannelVault -- "settlement" --> RecipientATA
    ChannelVault -- "close refund" --> FunderATA
```

## Data Flow Summary

### Off-Chain Flows (per request, zero on-chain cost)

```mermaid
flowchart LR
    A["Client"] -- "1. Request + channel credentials" --> B["Server Middleware"]
    B -- "2. Verify sig + seq (off-chain)" --> B
    B -- "3. Meter usage locally" --> B
    B -- "4. Forward to service" --> C["Service Logic"]
    C -- "5. Response" --> B
    B -- "6. Response + balance" --> A
```

### On-Chain Flows (infrequent, ~3 total per channel lifetime)

```mermaid
flowchart LR
    D["Client"] -- "1. open_channel" --> E["AMP Program"]
    E -- "2. Init PDA + vault, transfer deposit" --> F["Solana"]
    G["Server"] -- "3. settle (periodic)" --> E
    E -- "4. Transfer to recipient" --> F
    D -- "5. close_channel" --> E
    E -- "6. Final settle + refund" --> F
```

## Component Responsibilities

| Component | Responsibilities |
|-----------|-----------------|
| **Client SDK** | Discovery, channel open/close/top-up, sequence management, signature generation, `fetch()` wrapper |
| **Server Middleware** | Pricing endpoint, 402 responses, channel validation, signature verification, metering, settlement submission |
| **AMP Program** | Channel state management, token custody, settlement verification (Ed25519 precompile), fund transfers |
| **Channel Vault** | SPL token account owned by PDA, holds deposited funds, source for settlements and refunds |
