# Channel Lifecycle

State diagram showing the lifecycle of an AMP channel from discovery through closure.

```mermaid
stateDiagram-v2
    [*] --> Discovered: Client discovers AMP pricing

    Discovered --> Opening: Client submits open_channel tx

    Opening --> Active: Transaction confirmed on Solana

    Active --> Active: Top-up (funder adds funds)
    Active --> Settling: Settlement triggered
    Settling --> Active: Settlement confirmed on-chain

    Active --> Closing: close_channel requested
    Closing --> Closed: Final settlement + refund complete

    Closed --> [*]

    note right of Discovered
        Discovery via:
        - /.well-known/amp.json
        - HTTP 402 response headers
        - In-band signaling
    end note

    note right of Active
        During Active state:
        - Zero on-chain txns per request
        - Server meters off-chain
        - Client sends AMP-Channel + AMP-Seq + AMP-Sig
    end note

    note right of Settling
        Settlement is net:
        - One txn covers all usage since last settlement
        - Triggered by interval, threshold, or explicit request
    end note

    note right of Closed
        On close:
        - Unsettled amount → recipient
        - Remaining balance → funder
        - PDA + vault accounts closed
        - Rent returned to funder
    end note
```

## State Transitions

| From | To | Trigger | On-chain |
|------|----|---------|----------|
| — | Discovered | Client queries pricing | No |
| Discovered | Opening | Client submits `open_channel` | Yes |
| Opening | Active | Transaction finalized | Yes |
| Active | Active | `top_up` instruction | Yes |
| Active | Settling | Interval elapsed / threshold reached / explicit request | Yes |
| Settling | Active | Settlement tx confirmed | Yes |
| Active | Closing | `close_channel` instruction | Yes |
| Closing | Closed | Final settlement + refund confirmed | Yes |
