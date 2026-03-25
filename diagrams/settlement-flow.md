# Settlement Flow

Sequence diagram showing the full settlement process between a client, server, and the Solana AMP program.

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant AMPProgram as AMP Program (Solana)
    participant Vault as Channel Vault
    participant RecipientATA as Recipient Token Account

    Note over Client,Server: Normal consumption (off-chain)
    loop Every API call
        Client->>Server: Request + AMP-Channel + AMP-Seq + AMP-Sig
        Server->>Server: Verify signature (off-chain)
        Server->>Server: Increment metering counter
        Server-->>Client: Response + AMP-Balance
    end

    Note over Server: Settlement trigger condition met
    Server->>Server: Check: interval elapsed OR threshold reached

    Note over Server: Construct metering proof
    Server->>Server: Build payload: channel || amount || call_count || period_start || period_end || seq_start || seq_end
    Server->>Server: SHA256(payload) → digest
    Server->>Server: Ed25519 sign digest with recipient keypair

    Note over Server,AMPProgram: Submit settlement on-chain
    Server->>AMPProgram: settle(amount, metering_proof)
    AMPProgram->>AMPProgram: Verify metering proof signature via Ed25519 precompile
    AMPProgram->>AMPProgram: Verify amount <= balance
    AMPProgram->>AMPProgram: Verify current_time >= last_settle_ts + settle_interval

    AMPProgram->>Vault: Transfer amount tokens
    Vault->>RecipientATA: amount tokens received

    AMPProgram->>AMPProgram: Update state: balance -= amount
    AMPProgram->>AMPProgram: Update state: total_consumed += amount
    AMPProgram->>AMPProgram: Update state: last_settle_ts = now

    AMPProgram-->>Server: Settlement confirmed (tx signature)

    Note over Client,Server: Consumption continues
    Client->>Server: Next request + AMP-Channel + AMP-Seq + AMP-Sig
    Server-->>Client: Response + updated AMP-Balance
```

## Settlement Triggers

| Trigger | Condition | Example |
|---------|-----------|---------|
| Time interval | `current_time >= last_settle_ts + settle_interval` | Every 3600 seconds |
| Usage threshold | `accumulated_amount >= threshold` | Every 1,000,000 token units |
| Explicit request | Either party sends settlement request | Client or server initiates |
| Channel close | `close_channel` instruction submitted | Final settlement before refund |

## On-Chain State Changes

After a successful settlement:

| Field | Change |
|-------|--------|
| `balance` | Decreased by `amount` |
| `total_consumed` | Increased by `amount` |
| `last_settle_ts` | Set to current block timestamp |
