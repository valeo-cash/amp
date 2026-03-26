# AMP Protocol Specification

**Version**: 0.2 (Draft)
**Status**: Draft
**Authors**: Valeo Protocol
**Date**: 2026-03-25

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [Core Concepts](#2-core-concepts)
3. [Channel Lifecycle](#3-channel-lifecycle)
4. [On-Chain Architecture](#4-on-chain-architecture)
5. [Off-Chain Message Formats](#5-off-chain-message-formats)
6. [Transport Bindings](#6-transport-bindings)
7. [Security Model](#7-security-model)
8. [Error Codes](#8-error-codes)
9. [SDK API Surface](#9-sdk-api-surface)
10. [Comparison with x402 and MPP](#10-comparison-with-x402-and-mpp)
11. [MCP Transport Binding](#11-mcp-transport-binding)
12. [Service Registry](#12-service-registry)
13. [Multi-Channel Netting via Stratum](#13-multi-channel-netting-via-stratum)
14. [On-Chain Reputation](#14-on-chain-reputation)
15. [Channel Chaining](#15-channel-chaining)

---

## Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

| Term | Definition |
|------|------------|
| Funder | The party that deposits funds into a channel (typically an AI agent or client) |
| Recipient | The party that receives funds via settlement (typically a service provider) |
| Channel | A persistent financial state object between a funder and recipient, represented as an on-chain PDA |
| Vault | An SPL token account owned by the channel PDA, holding deposited funds |
| Metering | Off-chain usage tracking performed by the recipient |
| Settlement | On-chain transfer of owed funds from the vault to the recipient |
| Delegation | Assignment of consumption rights from a funder to a third-party pubkey |

---

## 1. Protocol Overview

### 1.1 What AMP Is

AMP (Autonomous Machine Payments) is a Solana-native protocol for persistent payment channels between autonomous agents and services. AMP replaces per-request payment primitives with continuous financial state: a funder opens a channel with a deposit, consumes services freely against that deposit, and settlement happens automatically via net clearing on Solana.

### 1.2 Problem Statement

Existing machine payment protocols — notably x402 and MPP — treat payments as discrete events tied to individual HTTP requests. This architecture produces three systemic problems:

1. **Per-call latency.** Every API call requires payment verification, adding round-trips and blocking the response path.
2. **Per-call on-chain transactions.** Each payment produces an on-chain transaction, creating O(N) transaction costs for N calls.
3. **Stateless interactions.** Each request is financially independent. There is no concept of an ongoing relationship, a budget, or accumulated trust.

Autonomous agents do not work this way. They maintain ongoing relationships with services, execute against budgets, open streaming connections, and delegate sub-tasks to other agents. A payment protocol for agents must model payments as continuous state, not discrete events.

### 1.3 Design Principles

1. **Zero runtime friction.** After channel open, consumption adds zero payment latency to requests. No signatures are verified on-chain, no transactions are submitted, and no payment round-trips occur during normal operation.
2. **Transport agnostic.** AMP works on HTTP, WebSocket, gRPC, MQTT, and raw TCP. The protocol defines transport bindings for each, separating the financial state layer from the communication layer.
3. **Solana native.** AMP uses SPL tokens, Program Derived Addresses (PDAs), and Solana's 400ms finality. All on-chain state is managed by a single Solana program.
4. **Credit-ready.** The channel model is architecturally compatible with credit and reputation extensions. A future Autonomous Credit Engine (ACE) MAY allow channels to operate with partial or zero deposits based on funder reputation.

### 1.4 AMP as a Financial State Protocol

AMP is not a payment protocol in the x402 sense. It is a financial state protocol. The distinction: x402 processes a payment per request; AMP maintains a financial relationship across requests. A channel is not a payment — it is a stateful financial object with a lifecycle, a balance, and a history.

---

## 2. Core Concepts

### 2.1 Channel

A **channel** is a persistent financial state object between two parties (funder and recipient), represented as an on-chain PDA on Solana. A channel holds deposited SPL tokens in a vault and tracks usage state.

A channel has a lifecycle:

```
Open → Active → Settled (repeating) → Closed
```

Properties:
- One funder-recipient pair MAY have multiple channels, distinguished by a nonce.
- A channel is identified by its PDA address, derived from funder pubkey, recipient pubkey, and nonce.
- A channel holds exactly one SPL token mint.
- A channel's balance decreases only via settlement or closure.

### 2.2 Metering

**Metering** is off-chain usage tracking performed by the server (recipient). The server tracks how much the client has consumed and produces signed metering proofs that authorize on-chain settlement.

Metering modes:

| Mode | Unit | Description |
|------|------|-------------|
| `per-call` | Fixed cost per invocation | Each API call costs a fixed amount |
| `per-second` | Cost per second of connection | For streaming, long-lived connections |
| `per-byte` | Cost per byte transferred | For data-heavy endpoints |
| `per-compute` | Cost per compute unit | For variable-cost operations (inference, rendering) |
| `custom` | Server-defined function | Server publishes a metering function; client agrees at channel open |

Metering is always off-chain. No on-chain transaction occurs during consumption. The server accumulates usage locally and settles periodically.

### 2.3 Settlement

**Settlement** is the process of transferring owed funds from the channel vault to the recipient. Settlement is always net — one on-chain transaction covers all usage since the last settlement.

Settlement is triggered when any of the following conditions are met:
- A defined time interval has elapsed since the last settlement (e.g., every 3600 seconds).
- Accumulated usage reaches a server-defined threshold (e.g., every 1,000,000 token units).
- Either party explicitly requests settlement.
- The channel is being closed.

Settlement requires the recipient to submit a signed metering proof to the on-chain program. The program verifies the proof and transfers the specified amount.

### 2.4 Delegation

A funder MAY assign a **delegate** pubkey to their channel. The delegate can consume services against the channel up to a specified limit. This enables agent-to-agent budget forwarding.

Example: Agent A opens a channel with a 10,000,000 unit deposit. Agent A delegates 2,000,000 units to Agent B. Agent B consumes services against Agent A's channel, up to the 2,000,000 unit cap. Agent A retains access to the remaining 8,000,000 units.

Delegation constraints:
- Only the funder MAY set or change the delegate.
- The delegate limit MUST NOT exceed the current channel balance.
- The server MUST track delegate consumption separately and reject requests that would exceed the delegate limit.

---

## 3. Channel Lifecycle

### 3.1 Discovery

Before opening a channel, the client MUST discover the server's AMP pricing. Three discovery mechanisms are defined.

#### 3.1.1 Well-Known Endpoint

The server SHOULD expose pricing at `/.well-known/amp.json`:

```json
{
  "amp_version": "1.0",
  "recipient": "<server_pubkey_base58>",
  "program_id": "<amp_program_id_base58>",
  "network": "solana:mainnet-beta",
  "pricing": {
    "default": {
      "mode": "per-call",
      "rate": "1000",
      "token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "min_deposit": "1000000",
      "settle_interval": 3600
    },
    "routes": {
      "/v1/inference": {
        "mode": "per-call",
        "rate": "10000"
      },
      "/v1/stream": {
        "mode": "per-second",
        "rate": "1000"
      }
    }
  }
}
```

All monetary values are in the token's smallest unit. USDC has 6 decimals: `"1000"` = 0.001 USDC.

Fields:
- `amp_version` (string, REQUIRED): Protocol version. Currently `"1.0"`.
- `recipient` (string, REQUIRED): The server's Solana pubkey in base58.
- `program_id` (string, REQUIRED): The AMP program ID in base58.
- `network` (string, REQUIRED): Solana network identifier. One of `"solana:mainnet-beta"`, `"solana:devnet"`, `"solana:testnet"`.
- `pricing.default` (object, REQUIRED): Default pricing applied to all routes unless overridden.
- `pricing.routes` (object, OPTIONAL): Per-route pricing overrides. Keys are route path prefixes.

Pricing object fields:
- `mode` (string, REQUIRED): One of `"per-call"`, `"per-second"`, `"per-byte"`, `"per-compute"`, `"custom"`.
- `rate` (string, REQUIRED): Cost per unit in token smallest unit.
- `token` (string, REQUIRED for default, OPTIONAL for route overrides): SPL token mint address in base58.
- `min_deposit` (string, REQUIRED for default): Minimum deposit to open a channel, in token smallest unit.
- `settle_interval` (integer, REQUIRED for default): Settlement interval in seconds.

#### 3.1.2 Response Header

On any request to an AMP-enabled endpoint without a valid channel, the server MUST respond with HTTP 402 and the following headers:

```
HTTP/1.1 402 Payment Required
AMP-Version: 1.0
AMP-Pricing: {"mode":"per-call","rate":"1000","token":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","min_deposit":"1000000","settle_interval":3600}
AMP-Recipient: <server_pubkey_base58>
AMP-Program: <amp_program_id_base58>
AMP-Network: solana:mainnet-beta
```

The `AMP-Pricing` header value is a JSON object matching the default pricing schema from Section 3.1.1.

The response body SHOULD contain a JSON error object:

```json
{
  "error": "AMP_NO_CHANNEL",
  "message": "This endpoint requires an AMP channel. See AMP-Pricing header for terms.",
  "amp_version": "1.0"
}
```

#### 3.1.3 In-Band Signaling

For non-HTTP transports (WebSocket, gRPC, MQTT, raw TCP), the server MUST send AMP pricing as the first message or frame after connection establishment, using the same JSON schema as the well-known endpoint.

### 3.2 Open

The client creates a channel by submitting the `open_channel` instruction to the AMP Solana program.

**Step 1: Derive the Channel PDA.**

```
Seeds: [b"amp-channel", funder_pubkey, recipient_pubkey, nonce_le_bytes]
```

Where `nonce_le_bytes` is the nonce as a little-endian u64 (8 bytes). The client SHOULD use nonce `0` for the first channel with a given recipient and increment for subsequent channels.

**Step 2: Submit the `open_channel` instruction.**

The instruction transfers `deposit_amount` tokens from the funder's token account to a newly created vault (an associated token account owned by the channel PDA). The ChannelState PDA is initialized with all channel parameters.

**Step 3: Notify the server.**

After on-chain confirmation, the client sends the channel PDA address to the server. For HTTP, this is done by including the `AMP-Channel` header on the next request. For other transports, the client sends a channel notification message (see Section 6).

The server MUST verify the channel on-chain before accepting requests:
1. The ChannelState account exists and is owned by the AMP program.
2. The `recipient` field matches the server's pubkey.
3. The `status` field is `Active` (0).
4. The `balance` field is greater than zero.
5. The `mint` field matches an accepted token.

### 3.3 Consume

After channel open, the client includes channel credentials with every request.

**HTTP headers:**

```
AMP-Channel: <channel_pda_base58>
AMP-Seq: <monotonic_sequence_number>
AMP-Sig: <ed25519_signature_of_seq_by_funder_base58>
```

- `AMP-Channel`: The channel PDA address in base58.
- `AMP-Seq`: A monotonically increasing integer. The client MUST increment this value for each request. The first request after channel open SHOULD use seq `1`.
- `AMP-Sig`: An Ed25519 signature of the sequence number (as a little-endian u64, 8 bytes) using the funder's keypair, encoded in base58.

**Server verification (MUST perform all steps):**

1. Verify the channel PDA exists on-chain and has status `Active`. The server MAY cache channel state and refresh periodically rather than querying on every request.
2. Verify the signature matches the channel's funder pubkey (or delegate pubkey, if delegation is active).
3. Verify the sequence number is strictly greater than the last seen sequence number for this channel.
4. Verify the channel balance is sufficient for at least one more settlement (balance > 0).
5. Serve the request.
6. Increment the local metering counter for this channel.

If any verification step fails, the server MUST reject the request with the appropriate error code (see Section 8).

**Zero on-chain transactions occur during consumption.** All verification is performed off-chain using cached channel state and Ed25519 signature verification.

### 3.4 Settle

Settlement is triggered by the server when any of the following conditions are met:
- `settle_interval` seconds have elapsed since `last_settle_ts`.
- Accumulated usage exceeds a server-defined threshold.
- Either party explicitly requests settlement.

**Settlement process:**

**Step 1:** The server constructs a MeteringProof:

```json
{
  "channel": "<channel_pda_base58>",
  "amount": 4500000,
  "call_count": 4500,
  "period_start": 1711234567,
  "period_end": 1711238167,
  "seq_start": 1001,
  "seq_end": 5500,
  "server_signature": "<ed25519_sig_by_recipient_base58>"
}
```

Fields:
- `channel` (string): Channel PDA address in base58.
- `amount` (integer): Total amount owed for this period, in token smallest unit.
- `call_count` (integer): Number of metered calls in this period.
- `period_start` (integer): Unix timestamp of the period start.
- `period_end` (integer): Unix timestamp of the period end.
- `seq_start` (integer): First sequence number in this period.
- `seq_end` (integer): Last sequence number in this period.
- `server_signature` (string): Ed25519 signature of the proof payload by the recipient (see Section 5).

**Step 2:** The server submits the `settle` instruction to the AMP program with the serialized metering proof.

**Step 3:** The program verifies:
- The signature matches the channel's `recipient` pubkey.
- `amount` is less than or equal to the channel `balance`.
- `current_time >= last_settle_ts + settle_interval`.

**Step 4:** On success, the program:
- Transfers `amount` from the ChannelVault to the recipient's token account.
- Updates: `balance -= amount`, `total_consumed += amount`, `last_settle_ts = now`.

### 3.5 Top-Up

The funder MAY add funds to an active channel at any time by submitting the `top_up` instruction.

1. The funder calls `top_up` with the desired `amount`.
2. Funds transfer from the funder's token account to the ChannelVault.
3. The on-chain state updates: `balance += amount`, `total_deposited += amount`.

Top-up does not affect metering, settlement timing, or sequence numbers.

### 3.6 Close

Either party MAY close a channel by submitting the `close_channel` instruction.

**Close process:**

1. The closer (funder or recipient) calls `close_channel`.
2. The program performs a final settlement: any unsettled amount (as specified in the instruction) is transferred to the recipient.
3. The remaining balance is returned to the funder's token account.
4. The ChannelState account is closed and rent-exempt lamports are returned to the funder.
5. The ChannelVault token account is closed and rent-exempt lamports are returned to the funder.

After closure, the channel PDA is no longer valid. The server MUST reject any subsequent requests referencing this channel with `AMP_CLOSED`.

---

## 4. On-Chain Architecture

### 4.1 Programs

The AMP ecosystem consists of three on-chain programs:

| Program | Program ID (placeholder) | Description |
|---------|--------------------------|-------------|
| `amp-channel` | `2d1B2PmumwYWuR82AbXAARTL1nrn8N7Vu9bLXTXUDmVA` (mainnet) / `2KQCaQ9j8YtewZ4QjmDfnsVANZXLBcPSYFhAj2eUNaPP` (devnet) | Channel state, token custody, settlement verification |
| `amp-registry` | `AMPREGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Service directory and discovery |
| `amp-reputation` | `AMPREPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | On-chain reputation scoring |

Final addresses are assigned at deployment. All programs are Anchor-compatible.

### 4.2 ChannelState Account

The ChannelState account is a PDA that stores all state for a single channel.

**PDA Seeds:**

```
[b"amp-channel", funder: Pubkey, recipient: Pubkey, nonce: u64 (LE)]
```

**Fields:**

| Field | Type | Offset | Size | Description |
|-------|------|--------|------|-------------|
| bump | u8 | 8 | 1 | PDA bump seed |
| funder | Pubkey | 9 | 32 | Channel funder (payer) |
| recipient | Pubkey | 41 | 32 | Channel recipient (service provider) |
| mint | Pubkey | 73 | 32 | SPL token mint |
| vault | Pubkey | 105 | 32 | Token account holding channel funds |
| balance | u64 | 137 | 8 | Current available balance (token smallest unit) |
| total_deposited | u64 | 145 | 8 | Lifetime deposits |
| total_consumed | u64 | 153 | 8 | Lifetime settled amount |
| rate_limit | u64 | 161 | 8 | Max tokens per settle_interval |
| settle_interval | i64 | 169 | 8 | Seconds between settlements |
| last_settle_ts | i64 | 177 | 8 | Unix timestamp of last settlement |
| nonce | u64 | 185 | 8 | Channel nonce |
| status | u8 | 193 | 1 | 0 = Active, 1 = Closed |
| created_at | i64 | 194 | 8 | Channel creation Unix timestamp |
| delegate | Option\<Pubkey\> | 202 | 33 | Optional delegated consumer (1 byte tag + 32 bytes pubkey) |
| delegate_limit | u64 | 235 | 8 | Max amount delegate can consume |
| delegate_consumed | u64 | 243 | 8 | Amount delegate has consumed |
| stratum_enabled | bool | 251 | 1 | Whether channel opts into multilateral netting (Section 13) |
| stratum_cycle | i64 | 252 | 8 | Netting cycle interval in seconds |
| stratum_authority | Option\<Pubkey\> | 260 | 33 | Stratum netting engine pubkey, authorized to call settle |
| parent_channel | Option\<Pubkey\> | 293 | 33 | Upstream channel PDA for chained channels (Section 15) |
| child_channels | u8 | 326 | 1 | Number of active downstream channels |
| max_chain_depth | u8 | 327 | 1 | Maximum allowed chain depth (default: 3) |
| chain_depth | u8 | 328 | 1 | Current depth in the chain (0 = root) |

**Total account size:** 8 (discriminator) + 321 = **329 bytes**

The 8-byte discriminator is prepended by Anchor and identifies the account type.

### 4.3 Instructions

#### 4.3.1 `open_channel`

Creates a new channel between funder and recipient.

**Accounts:**

| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| funder | Yes | Yes | Channel funder, pays for account creation |
| recipient | No | No | Channel recipient |
| mint | No | No | SPL token mint |
| channel_state | No | Yes | ChannelState PDA (init) |
| vault | No | Yes | Token account for PDA (init) |
| funder_token_account | No | Yes | Funder's token account (source of deposit) |
| system_program | No | No | System Program |
| token_program | No | No | SPL Token Program |
| associated_token_program | No | No | Associated Token Program |
| rent | No | No | Rent sysvar |

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| deposit | u64 | Initial deposit amount (token smallest unit) |
| rate_limit | u64 | Max tokens per settle_interval |
| settle_interval | i64 | Seconds between settlements |
| nonce | u64 | Channel nonce |

**Constraints:**
- `deposit` MUST be greater than zero.
- `settle_interval` MUST be greater than zero.
- `rate_limit` MUST be greater than zero.
- The channel PDA MUST NOT already exist.

#### 4.3.2 `top_up`

Adds funds to an existing active channel.

**Accounts:**

| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| funder | Yes | Yes | Channel funder |
| channel_state | No | Yes | ChannelState PDA |
| vault | No | Yes | Channel vault token account |
| funder_token_account | No | Yes | Funder's token account |
| token_program | No | No | SPL Token Program |

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| amount | u64 | Amount to add (token smallest unit) |

**Constraints:**
- Channel `status` MUST be `Active` (0).
- `amount` MUST be greater than zero.
- `channel_state.funder` MUST equal the `funder` account.

#### 4.3.3 `settle`

Settles accumulated usage by transferring funds from the vault to the recipient.

**Accounts:**

| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| settler | Yes | Yes | Channel recipient OR stratum_authority (submits settlement) |
| channel_state | No | Yes | ChannelState PDA |
| vault | No | Yes | Channel vault token account |
| recipient_token_account | No | Yes | Recipient's token account (destination) |
| token_program | No | No | SPL Token Program |

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| amount | u64 | Settlement amount (token smallest unit) |
| metering_proof | Vec\<u8\> | Serialized and signed metering proof |

**Constraints:**
- Channel `status` MUST be `Active` (0).
- `amount` MUST be less than or equal to `balance`.
- `current_time` MUST be greater than or equal to `last_settle_ts + settle_interval`.
- The `metering_proof` signature MUST be valid against the `recipient` pubkey (verified via Ed25519 precompile).
- `settler` MUST be either `channel_state.recipient` OR `channel_state.stratum_authority` (if set). This allows Stratum to settle on behalf of the recipient during netting cycles (see Section 13).

#### 4.3.4 `close_channel`

Closes a channel, performs final settlement, and returns remaining funds.

**Accounts:**

| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| closer | Yes | No | Either funder or recipient |
| funder | No | Yes | Channel funder (receives remaining balance) |
| recipient | No | Yes | Channel recipient (receives final settlement) |
| channel_state | No | Yes | ChannelState PDA (closed after instruction) |
| vault | No | Yes | Channel vault (closed after instruction) |
| funder_token_account | No | Yes | Funder's token account |
| recipient_token_account | No | Yes | Recipient's token account |
| token_program | No | No | SPL Token Program |

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| final_amount | u64 | Final settlement amount owed to recipient |
| metering_proof | Vec\<u8\> | Serialized and signed metering proof for final period |

**Constraints:**
- `closer` MUST be either the `funder` or the `recipient`.
- Channel `status` MUST be `Active` (0).
- `final_amount` MUST be less than or equal to `balance`.
- If `final_amount > 0`, the `metering_proof` MUST be valid.

#### 4.3.5 `delegate`

Assigns or updates a delegate on the channel.

**Accounts:**

| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| funder | Yes | No | Channel funder |
| channel_state | No | Yes | ChannelState PDA |

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| delegate | Pubkey | Delegate's public key |
| limit | u64 | Max amount delegate can consume (token smallest unit) |

**Constraints:**
- Channel `status` MUST be `Active` (0).
- `limit` MUST be less than or equal to `balance`.
- `channel_state.funder` MUST equal the `funder` account.

#### 4.3.6 `chain_channel`

Creates a downstream channel funded from an upstream channel's vault. See Section 15 for full semantics.

**Accounts:**

| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| upstream_recipient | Yes | No | Recipient of the upstream channel (caller) |
| upstream_channel | No | Yes | Upstream ChannelState PDA |
| upstream_vault | No | Yes | Upstream channel vault (source of funds) |
| downstream_recipient | No | No | Recipient of the new downstream channel |
| downstream_channel | No | Yes | Downstream ChannelState PDA (init) |
| downstream_vault | No | Yes | Downstream vault token account (init) |
| mint | No | No | SPL token mint |
| system_program | No | No | System Program |
| token_program | No | No | SPL Token Program |
| associated_token_program | No | No | Associated Token Program |
| rent | No | No | Rent sysvar |

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| amount | u64 | Amount to allocate from upstream to downstream |
| rate_limit | u64 | Rate limit for downstream channel |
| settle_interval | i64 | Settlement interval for downstream channel |
| nonce | u64 | Nonce for downstream channel PDA derivation |

**Constraints:**
- `upstream_recipient` MUST equal `upstream_channel.recipient`.
- Upstream channel `status` MUST be `Active` (0).
- `amount` MUST be less than or equal to `upstream_channel.balance`.
- `upstream_channel.chain_depth` MUST be less than `upstream_channel.max_chain_depth`.
- The downstream channel PDA is derived with seeds: `[b"amp-channel", upstream_channel (as funder), downstream_recipient, nonce_le_bytes]`.
- On success: `upstream_channel.balance -= amount`, `upstream_channel.child_channels += 1`, downstream channel is initialized with `chain_depth = upstream_channel.chain_depth + 1` and `parent_channel = upstream_channel`.

---

## 5. Off-Chain Message Formats

### 5.1 Discovery Response Schema

See Section 3.1.1 for the complete `/.well-known/amp.json` schema.

### 5.2 Channel Credential Headers

See Section 3.3 for HTTP header format. The same fields apply across all transports (see Section 6).

### 5.3 Metering Proof Schema

```json
{
  "channel": "<channel_pda_base58>",
  "amount": "<u64>",
  "call_count": "<u64>",
  "period_start": "<unix_timestamp>",
  "period_end": "<unix_timestamp>",
  "seq_start": "<u64>",
  "seq_end": "<u64>",
  "server_signature": "<ed25519_signature_base58>"
}
```

### 5.4 Metering Proof Signature Scheme

The server signs the following data to produce the `server_signature`:

**Signed payload:**

```
SHA256(channel_pda || amount || call_count || period_start || period_end || seq_start || seq_end)
```

Where:
- `channel_pda` is the 32-byte public key of the channel PDA.
- `amount`, `call_count`, `period_start`, `period_end`, `seq_start`, `seq_end` are each encoded as little-endian u64 (8 bytes).
- `||` denotes byte concatenation.

**Total signed payload size:** 32 + (6 × 8) = 80 bytes.

**Hash:** SHA-256 of the 80-byte payload, producing a 32-byte digest.

**Signature:** Ed25519 signature of the 32-byte digest using the recipient's keypair.

**On-chain verification:** The AMP program verifies this signature using Solana's Ed25519 precompile (`Ed25519SigVerify111111111111111111111111111`). The settlement transaction MUST include an Ed25519 signature verification instruction prior to the `settle` instruction.

### 5.5 Client Sequence Signature Scheme

The client signs the sequence number to prove request authenticity:

**Signed payload:** The sequence number as a little-endian u64 (8 bytes).

**Signature:** Ed25519 signature of the 8-byte payload using the funder's keypair (or delegate's keypair).

The server verifies this signature off-chain using the funder's pubkey (from the channel's on-chain state) or the delegate's pubkey.

---

## 6. Transport Bindings

AMP is transport agnostic. This section defines how AMP metadata is carried on each supported transport. MCP (Model Context Protocol) is covered separately in Section 11 due to its importance in the AI agent ecosystem.

### 6.1 HTTP

**Discovery:** `/.well-known/amp.json` (Section 3.1.1) or HTTP 402 response headers (Section 3.1.2).

**Request credentials:** HTTP headers on every request:

```
AMP-Channel: <channel_pda_base58>
AMP-Seq: <sequence_number>
AMP-Sig: <signature_base58>
```

**Server responses** include the `AMP-Balance` header to inform the client of remaining channel balance:

```
AMP-Balance: 8500000
```

**Error responses** use standard HTTP status codes mapped to AMP error codes (Section 8).

### 6.2 WebSocket

**Discovery:** Server sends pricing as the first text frame after WebSocket handshake, using the same JSON schema as `/.well-known/amp.json`.

**Channel binding:** Client sends the first text frame as a JSON channel binding message:

```json
{
  "amp_channel": "<channel_pda_base58>",
  "amp_seq": 0,
  "amp_sig": "<signature_base58>"
}
```

**Server acknowledgment:**

```json
{
  "amp_status": "active",
  "amp_balance": "5000000"
}
```

**Subsequent messages** use one of two formats:

*Text mode:* JSON wrapper with AMP fields:
```json
{
  "amp_seq": 42,
  "amp_sig": "<signature_base58>",
  "payload": { ... }
}
```

*Binary mode:* Binary prefix encoding:
```
[2 bytes: amp_seq as u16 LE]
[64 bytes: amp_sig as raw Ed25519 signature]
[remaining bytes: application payload]
```

### 6.3 gRPC

**Discovery:** The server exposes an AMP discovery RPC method, or the client calls any method and receives a gRPC status `FAILED_PRECONDITION` with AMP pricing in the error details.

**Request credentials:** gRPC metadata keys on every RPC call:

```
amp-channel: <channel_pda_base58>
amp-seq: <sequence_number>
amp-sig: <signature_base58>
```

**Streaming RPCs:** For server-streaming or bidirectional-streaming RPCs, the client sends AMP metadata in the initial request metadata. The server meters each response message sent.

### 6.4 MQTT

**Discovery:** Server publishes AMP pricing to a well-known topic: `$amp/pricing`.

**Channel binding:** Client includes AMP channel credentials in the CONNECT packet as User Properties (MQTT 5.0):

```
amp-channel: <channel_pda_base58>
amp-seq: 0
amp-sig: <signature_base58>
```

**Per-message metering:** Client includes `amp-seq` and `amp-sig` as User Properties on each PUBLISH packet.

### 6.5 Raw TCP

**Discovery:** Server sends AMP pricing as the first frame after TCP connection establishment.

**Frame format:**

```
[2 bytes: envelope length as u16 LE]
[N bytes: CBOR-encoded {channel, seq, sig}]
[remaining bytes: application payload]
```

The CBOR envelope contains:
```cbor
{
  "c": <channel_pda_bytes_32>,
  "s": <sequence_number_u64>,
  "g": <signature_bytes_64>
}
```

Short keys (`c`, `s`, `g`) minimize overhead for high-frequency TCP streams.

---

## 7. Security Model

### 7.1 PDA Ownership

The ChannelState PDA is owned by the AMP program. Neither the funder nor the recipient can directly read or modify the account data through any means other than the AMP program's instructions. This ensures that funds in the vault cannot be moved except through the defined `settle`, `close_channel`, and `top_up` code paths.

### 7.2 Fund Movement Constraints

Funds in the ChannelVault can only move in two directions:

1. **To the recipient**, via the `settle` instruction or the final settlement in `close_channel`. Both require a valid metering proof signed by the recipient.
2. **To the funder**, via the `close_channel` instruction (remaining balance after final settlement).

No other fund movement is possible. The vault's token account authority is the channel PDA, and only the AMP program can sign for the PDA.

### 7.3 Replay Prevention

The client MUST include a monotonically increasing sequence number (`AMP-Seq`) with every request. The server MUST reject any request where `seq <= last_seen_seq` for the given channel, returning `AMP_INVALID_SEQ`.

This prevents:
- Replay attacks (resending a previously valid request).
- Out-of-order processing that could lead to double-metering.

The server SHOULD persist the last seen sequence number to survive restarts.

### 7.4 Rate Limiting

Rate limiting is enforced at two levels:

1. **On-chain:** The `rate_limit` field in ChannelState defines the maximum tokens that can be settled per `settle_interval`. The `settle` instruction enforces this limit.
2. **Off-chain:** The server SDK enforces rate limits in middleware, rejecting requests that would cause the channel to exceed its rate limit before the next settlement.

### 7.5 Dispute Model

AMP uses a simple dispute model based on unilateral channel closure:

- If the server overcharges (submits a metering proof for more than the actual usage), the client can close the channel immediately. The client loses at most one unsettled period's worth of consumption.
- For high-value channels, shorter `settle_interval` values reduce the maximum loss in a dispute.
- The metering proof is signed by the server. In the event of a dispute, the on-chain proof history provides an auditable record.

AMP does not implement an on-chain dispute resolution mechanism. The trust assumption is that the server and client have aligned economic incentives (the server wants repeat business) and that the maximum loss per dispute (one settlement period) is bounded and known in advance.

### 7.6 Sybil Resistance

Opening a channel requires:
1. An on-chain transaction (paying Solana transaction fees).
2. A token deposit (minimum deposit enforced by the server's pricing).
3. Rent-exempt balance for the ChannelState and vault accounts.

These costs make sybil channel attacks economically impractical. A server MAY impose additional minimum deposit requirements beyond the protocol minimum.

---

## 8. Error Codes

The following error codes are defined by AMP. Servers MUST use these codes in error responses across all transports.

| Code | Description | HTTP Status | When |
|------|-------------|-------------|------|
| `AMP_NO_CHANNEL` | No valid channel for this request | 402 | Request lacks AMP-Channel header or references unknown channel |
| `AMP_UNDERFUNDED` | Channel balance below minimum | 402 | Channel balance insufficient for continued service |
| `AMP_CLOSED` | Channel has been closed | 410 | Request references a closed channel |
| `AMP_RATE_EXCEEDED` | Usage exceeds channel rate limit | 429 | Consumption rate exceeds the channel's rate_limit |
| `AMP_INVALID_PROOF` | Metering proof signature invalid | 400 | Settlement attempted with invalid or malformed proof |
| `AMP_SETTLE_EARLY` | Settlement attempted before interval | 425 | settle_interval has not elapsed since last settlement |
| `AMP_DEPOSIT_LOW` | Initial deposit below minimum | 400 | open_channel called with deposit below min_deposit |
| `AMP_INVALID_SEQ` | Sequence number not monotonically increasing | 400 | AMP-Seq is less than or equal to last seen seq |
| `AMP_INVALID_SIG` | Client signature verification failed | 401 | AMP-Sig does not match the expected signer |

**Error response format (HTTP):**

```json
{
  "error": "AMP_UNDERFUNDED",
  "message": "Channel balance is 500 but minimum required is 1000.",
  "channel": "<channel_pda_base58>",
  "balance": 500
}
```

For non-HTTP transports, errors are sent as JSON messages with the same schema.

---

## 9. SDK API Surface

This section defines the TypeScript API surface for the AMP server and client SDKs. These types are normative — conforming implementations MUST expose this API.

### 9.1 Server SDK

```typescript
import { AMP } from "@valeo/amp-server";

interface AMPServerConfig {
  /** Server's Solana keypair for signing metering proofs */
  wallet: Keypair;

  /** AMP program ID */
  programId?: PublicKey;

  /** Solana RPC endpoint */
  rpcUrl?: string;

  /** Default pricing applied to all routes */
  pricing: AMPPricing;

  /** Per-route pricing overrides */
  routes?: Record<string, AMPPricing>;

  /** Settlement configuration */
  settlement?: {
    /** Settlement interval in seconds (default: 3600) */
    interval?: number;
    /** Usage threshold that triggers settlement (token smallest unit) */
    threshold?: number;
  };

  /** Event handlers */
  onChannelOpen?: (channel: ChannelInfo) => void;
  onSettle?: (settlement: SettlementInfo) => void;
  onClose?: (channel: ChannelInfo) => void;
  onError?: (error: AMPError) => void;
}

interface AMPPricing {
  /** Metering mode */
  mode: "per-call" | "per-second" | "per-byte" | "per-compute" | "custom";

  /** Cost per unit in token smallest unit */
  rate: string;

  /** SPL token mint address */
  token?: string;

  /** Minimum deposit to open a channel */
  minDeposit?: string;
}

interface ChannelInfo {
  /** Channel PDA address */
  address: PublicKey;
  /** Funder's public key */
  funder: PublicKey;
  /** Current balance */
  balance: bigint;
  /** Total consumed */
  totalConsumed: bigint;
  /** Channel creation timestamp */
  createdAt: number;
}

interface SettlementInfo {
  /** Channel PDA address */
  channel: PublicKey;
  /** Settlement amount */
  amount: bigint;
  /** Number of calls in this period */
  callCount: number;
  /** Transaction signature */
  txSignature: string;
}

interface AMPError {
  code: string;
  message: string;
  channel?: PublicKey;
}
```

**Middleware usage (Express):**

```typescript
const amp = AMP.middleware({
  wallet: serverKeypair,
  pricing: { mode: "per-call", rate: "1000", token: USDC_MINT },
  routes: {
    "/v1/inference": { mode: "per-call", rate: "10000" },
    "/v1/stream": { mode: "per-second", rate: "1000" },
  },
  settlement: { interval: 3600 },
});

app.use(amp);
```

The middleware:
1. Intercepts all incoming requests.
2. If no `AMP-Channel` header is present, responds with HTTP 402 and AMP pricing headers.
3. If a channel is present, validates the channel, sequence number, and signature.
4. Attaches channel info to the request object (`req.amp`).
5. After the response is sent, increments the metering counter.
6. Runs a background settlement loop.

### 9.2 Client SDK

```typescript
import { AMPClient } from "@valeo/amp-client";

interface AMPClientConfig {
  /** Agent's Solana keypair */
  wallet: Keypair;

  /** Total budget in human-readable units (e.g., 10.00 for $10 USDC) */
  budget: number;

  /** SPL token symbol or mint address */
  token: string;

  /** AMP program ID */
  programId?: PublicKey;

  /** Solana RPC endpoint */
  rpcUrl?: string;

  /** Auto-discover pricing from server (default: true) */
  autoDiscover?: boolean;

  /** Auto top-up when balance drops below threshold */
  autoTopUp?: {
    /** Balance threshold that triggers top-up (human-readable units) */
    threshold: number;
    /** Amount to top up (human-readable units) */
    amount: number;
  };
}

interface AMPResponse extends Response {
  /** Remaining channel balance after this request */
  ampBalance: bigint;
  /** Channel used for this request */
  ampChannel: PublicKey;
}
```

**Client usage:**

```typescript
const amp = new AMPClient({
  wallet: agentKeypair,
  budget: 10.0,
  token: "USDC",
});

// fetch() handles discovery, channel open, and credential attachment
const res = await amp.fetch("https://api.example.com/v1/data", {
  method: "POST",
  body: JSON.stringify({ query: "test" }),
});

console.log(res.ampBalance); // remaining balance
console.log(await res.json()); // response data

// Close all open channels and recover remaining funds
await amp.closeAll();
```

The client SDK:
1. On first `fetch()` to a new host, discovers AMP pricing via `/.well-known/amp.json` or 402 response.
2. Opens a channel with the configured budget (converted to token smallest unit).
3. Attaches `AMP-Channel`, `AMP-Seq`, and `AMP-Sig` headers to every subsequent request.
4. Manages sequence number state internally.
5. Optionally auto-tops-up channels when balance drops below a threshold.

---

## 10. Comparison with x402 and MPP

For a detailed comparison with sequence diagrams and cost analysis, see [COMPARISON.md](COMPARISON.md).

### 10.1 Protocol Flow Comparison

**x402** uses HTTP 402 with per-request payments on Base. Each call requires a payment transaction, a retry with a receipt, and on-chain verification. One on-chain transaction per call.

**MPP** defines two intents: `charge` (per-request, similar to x402) and `session` (payment channels with off-chain vouchers). MPP sessions open a channel once, then use cumulative off-chain vouchers for subsequent requests — conceptually similar to AMP's channel model. MPP is payment-method agnostic, supporting Tempo, Stripe, cards, Lightning, and Solana.

**AMP** opens a Solana-native channel once, then serves requests with zero on-chain cost. Settlement is net-cleared at intervals — one transaction covers all usage in a period regardless of call count.

```
x402:  1,000 calls → 1,000 on-chain txns
MPP:   1,000 calls → 2 on-chain txns (session open + close) + 1,000 off-chain vouchers
AMP:   1,000 calls → ~3 on-chain txns (open + settle + close) + 1,000 off-chain metered calls
```

### 10.2 Feature Matrix

| Feature | x402 | MPP | AMP |
|---------|------|-----|-----|
| Payment Model | Per-request only | Per-request (charge) + sessions (pay-as-you-go) | Persistent channels with net settlement |
| Core Primitive | HTTP 402 receipt | HTTP 402 challenge/credential framework | Solana PDA financial state channel |
| Runtime Latency | Per-call (payment + retry) | Per-call (charge) / near-zero (session vouchers) | Zero after channel open |
| Statefulness | Stateless | Stateless (charge) / stateful (session) | Persistent on-chain state |
| Transport | HTTP only | HTTP + MCP/JSON-RPC | HTTP + WebSocket + gRPC + MQTT + TCP + MCP |
| Chain / Network | Base (EVM) | Tempo (primary), Solana, Lightning, cards, Stripe | Solana native (direct, no intermediary) |
| Settlement | Immediate per-call | Per-call (charge) / per-channel (session) | Net cleared at intervals (1 tx per period) |
| On-chain Txns / 1K calls | 1,000 | 2 (session: open + close) | ~3 (open + settle + close) |
| Payment Methods | USDC on Base | Multi-method (Tempo, Stripe, cards, Lightning, Solana) | USDC (SPL) on Solana |
| Streaming Support | None | SSE with voucher renewal | Native (any transport) |
| Credit Support | None | None | Native (ACE integration ready) |
| Delegation | None | None | Native (delegate instruction) |
| On-chain Composability | Limited (EVM) | Varies by payment method | Full Solana DeFi (PDA is readable/composable) |
| Fiat Support | No | Yes (Stripe, cards) | No (crypto-native) |
| MCP Support | No | Native transport binding | Native (Section 11) |
| Service Discovery | No | No | On-chain registry (Section 12) |
| Multi-channel Netting | No | No | Stratum integration (Section 13) |
| On-chain Reputation | No | No | Native scoring (Section 14) |
| Supply Chain Channels | No | No | Channel chaining (Section 15) |

### 10.3 Key Differentiators

MPP sessions and AMP channels are comparable in transaction efficiency. The differences are architectural:

1. **Solana-native state.** AMP's ChannelState PDA is a first-class Solana account. Other programs can read it, compose with it in CPIs, and build on top of it. MPP's channel state lives on whatever underlying payment network is negotiated.
2. **Net settlement.** AMP settles net amounts at intervals via signed metering proofs. MPP sessions use cumulative vouchers settled at channel close.
3. **Delegation.** AMP's `delegate` instruction enables on-chain agent-to-agent budget forwarding. MPP has no equivalent mechanism.
4. **Credit readiness.** AMP's channel model supports credit extension via reputation-based deposit reduction. MPP requires upfront deposits.
5. **Transport breadth.** AMP defines bindings for MCP, gRPC, MQTT, and raw TCP in addition to HTTP and WebSocket. MPP covers HTTP and MCP/JSON-RPC.
6. **Payment method flexibility.** MPP supports multiple payment methods (Tempo, Stripe, cards, Lightning, Solana). AMP is Solana-only. This is a trade-off, not an advantage.

---

## 11. MCP Transport Binding

MCP (Model Context Protocol) is a JSON-RPC 2.0 protocol used by AI agent frameworks for tool invocation. AMP MUST support MCP as a first-class transport, enabling paid tool calls with per-tool pricing.

### 11.1 Discovery via MCP

An AMP-enabled MCP server MUST advertise pricing via a dedicated `amp/pricing` JSON-RPC method:

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "amp/pricing",
  "id": 1
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "amp_version": "1.0",
    "recipient": "<server_pubkey_base58>",
    "program_id": "<amp_program_id_base58>",
    "network": "solana:mainnet-beta",
    "pricing": {
      "default": {
        "mode": "per-call",
        "rate": "1000",
        "token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "min_deposit": "1000000",
        "settle_interval": 3600
      },
      "tools": {
        "generate_image": { "mode": "per-call", "rate": "50000" },
        "search_web": { "mode": "per-call", "rate": "5000" },
        "stream_data": { "mode": "per-second", "rate": "1000" }
      }
    }
  },
  "id": 1
}
```

The `pricing.tools` object maps MCP tool names to their pricing. Each tool MAY have its own rate and mode. If a tool is not listed, the `default` pricing applies.

The server MAY also advertise pricing in individual tool descriptions via the `tools/list` response.

### 11.2 Channel Reference in Tool Calls

When calling a paid MCP tool, the client MUST include AMP credentials in the `_amp` field of the JSON-RPC `params` object:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "generate_image",
    "arguments": { "prompt": "a cat in space" },
    "_amp": {
      "channel": "<channel_pda_base58>",
      "seq": 42,
      "sig": "<ed25519_sig_base58>"
    }
  },
  "id": 2
}
```

The `_amp` field is a reserved namespace. MCP servers that do not support AMP MUST ignore fields prefixed with `_`. The `channel`, `seq`, and `sig` fields follow the same semantics as the HTTP headers defined in Section 3.3.

### 11.3 Payment Required Response

If a tool call lacks valid AMP credentials, the server MUST respond with a JSON-RPC error containing AMP pricing in the `data` field:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "AMP_NO_CHANNEL",
    "data": {
      "amp_pricing": {
        "mode": "per-call",
        "rate": "50000",
        "token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "min_deposit": "1000000",
        "recipient": "<server_pubkey_base58>",
        "program_id": "<amp_program_id_base58>"
      }
    }
  },
  "id": 2
}
```

The JSON-RPC error code MUST be `-32602` (Invalid Params). The `message` field MUST be an AMP error code from Section 8. The `data.amp_pricing` object provides the client with all information needed to open a channel.

### 11.4 Tool Call Response with Balance

On a successful paid tool call, the server SHOULD include remaining channel balance in the result:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [{ "type": "text", "text": "..." }],
    "_amp": {
      "balance": "4950000",
      "seq": 42
    }
  },
  "id": 2
}
```

### 11.5 Server SDK for MCP

```typescript
import { AMPMcpServer } from "@valeo/amp-server/mcp";

const server = new AMPMcpServer({
  wallet: serverKeypair,
  tools: {
    generate_image: {
      description: "Generate an image from a text prompt",
      pricing: { mode: "per-call", rate: "50000" },
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
      handler: async (args, ampContext) => {
        // ampContext.channel — channel PDA address
        // ampContext.seq — current sequence number
        // ampContext.balance — remaining channel balance
        return { image_url: "https://..." };
      },
    },
  },
});

server.listen();
```

### 11.6 Client SDK for MCP

```typescript
import { AMPMcpClient } from "@valeo/amp-client/mcp";

const client = new AMPMcpClient({
  wallet: agentKeypair,
  budget: 5.0,
  token: "USDC",
});

await client.connect("stdio:///path/to/mcp-server");

const result = await client.callTool("generate_image", {
  prompt: "a cat in space",
});

await client.close();
```

The client SDK handles discovery (`amp/pricing`), channel open, credential attachment, and sequence management automatically. The `connect` method accepts `stdio://` and `http+sse://` connection strings.

---

## 12. Service Registry

The AMP Service Registry is a Solana program that maintains a directory of AMP-enabled services. Any service provider MAY register. Agents query the registry to discover services by category, price, and reputation.

### 12.1 Registry Program

**Program:** `amp-registry`

**ServiceEntry Account** (PDA):

```
Seeds: [b"amp-service", provider_pubkey]
```

**Fields:**

| Field | Type | Size | Description |
|-------|------|------|-------------|
| bump | u8 | 1 | PDA bump seed |
| provider | Pubkey | 32 | Service provider's pubkey (= channel recipient) |
| endpoint | String | 128 | Service URL or MCP connection string |
| category | u8 | 1 | Service category enum |
| pricing_mode | u8 | 1 | 0=per-call, 1=per-second, 2=per-byte, 3=per-compute, 4=custom |
| rate | u64 | 8 | Cost per unit in token smallest unit |
| token | Pubkey | 32 | SPL token mint accepted |
| min_deposit | u64 | 8 | Minimum channel deposit |
| settle_interval | i64 | 8 | Settlement interval in seconds |
| description | String | 256 | Human/agent-readable service description |
| tags | \[u8; 8\] | 8 | Up to 8 tag IDs for searchability |
| reputation_score | u64 | 8 | Derived from channel history (Section 14) |
| total_channels | u64 | 8 | Lifetime channels opened with this service |
| total_settled | u64 | 8 | Lifetime volume settled (token smallest unit) |
| active_channels | u32 | 4 | Currently active channels |
| registered_at | i64 | 8 | Registration Unix timestamp |
| last_updated | i64 | 8 | Last update Unix timestamp |
| active | bool | 1 | Whether service is currently available |

**Total account size:** 8 (discriminator) + 528 bytes = **536 bytes**

### 12.2 Service Categories

| Value | Category | Description |
|-------|----------|-------------|
| 0 | Inference | LLM, image generation, embeddings |
| 1 | Data | Search, scraping, enrichment |
| 2 | Compute | GPU, serverless, batch processing |
| 3 | Storage | IPFS, Arweave, S3-compatible |
| 4 | Communication | Email, SMS, notifications |
| 5 | Financial | Pricing, market data, trading |
| 6 | Identity | KYC, verification, attestation |
| 7 | Other | Uncategorized |

### 12.3 Instructions

#### 12.3.1 `register_service`

Registers a new service in the directory.

**Arguments:** `endpoint` (String), `category` (u8), `pricing_mode` (u8), `rate` (u64), `token` (Pubkey), `min_deposit` (u64), `settle_interval` (i64), `description` (String), `tags` ([u8; 8])

**Accounts:** `provider` (signer, mut), `service_entry` (init, PDA), `system_program`

**Constraints:**
- The provider MUST be the signer.
- The ServiceEntry PDA MUST NOT already exist for this provider.
- Registration requires a small SOL deposit (rent-exempt minimum) as an anti-spam measure.

#### 12.3.2 `update_service`

Updates any field on an existing ServiceEntry.

**Constraints:**
- Only the `provider` (original signer) MAY call this instruction.
- The `last_updated` field is set to the current block timestamp.

#### 12.3.3 `deactivate_service`

Marks a service as inactive (`active = false`). Does NOT close the account — historical data is preserved.

**Constraints:**
- Only the `provider` MAY call this instruction.

#### 12.3.4 `close_service`

Closes the ServiceEntry account and returns rent to the provider.

**Constraints:**
- Only the `provider` MAY call this instruction.
- `active_channels` MUST be 0.

### 12.4 Querying the Registry

Agents query the registry off-chain by deserializing ServiceEntry accounts using `getProgramAccounts` with filters:

```typescript
import { AMPRegistry } from "@valeo/amp-client";

const services = await AMPRegistry.search({
  category: "inference",
  maxRate: "10000",
  token: "USDC",
  minReputation: 5000,
  sortBy: "reputation",
});

for (const svc of services) {
  console.log(`${svc.endpoint} — rate: ${svc.rate} — score: ${svc.reputation_score}`);
}
```

The client SDK provides convenience filters. Under the hood, it calls `getProgramAccounts` with `memcmp` filters on the `category`, `token`, and `active` fields, then applies client-side filtering and sorting.

### 12.5 Registry Statistics Updates

The `amp-channel` program MAY send a Cross-Program Invocation (CPI) to `amp-registry` to keep service statistics accurate:

- On `open_channel`: increment `total_channels` and `active_channels` for the recipient's ServiceEntry.
- On `settle`: increment `total_settled` by the settlement amount.
- On `close_channel`: decrement `active_channels`.

This keeps registry data current without requiring the service provider to manually update statistics. The CPI is optional — channels function correctly even if the recipient is not registered.

---

## 13. Multi-Channel Netting via Stratum

AMP channels MAY opt into multilateral netting through Valeo Stratum. Instead of each channel settling independently, Stratum aggregates all settlements across all opted-in channels in a netting cycle and produces the minimum set of on-chain transfers.

### 13.1 Why Netting Matters

Without netting (individual settlement):
- Agent A owes Service B: 5,000,000 units
- Agent A owes Service C: 3,000,000 units
- Service C owes Agent A: 2,000,000 units (refund/rebate)
- Total: 3 settlement transactions

With netting:
- Net: Agent A owes Service B: 5,000,000 units. Agent A owes Service C: 1,000,000 units (3,000,000 - 2,000,000).
- Total: 2 settlement transactions

At scale (100 agents, 100 services, 1,000 channels), the reduction is typically 60-80% fewer on-chain transactions.

### 13.2 Stratum-Enabled Channels

When opening a channel, the funder MAY set `stratum_enabled = true` on the ChannelState. The `stratum_cycle` field defines the netting interval in seconds. The `stratum_authority` field specifies the Stratum netting engine's pubkey, which is authorized to call `settle` on behalf of the recipient (see Section 4.3.3).

```typescript
const channel = await amp.openChannel({
  to: serviceB.pubkey,
  deposit: 10.0,
  stratumEnabled: true,
  stratumCycle: 3600,
});
```

When `stratum_enabled` is true:
- Individual `settle` calls by the recipient are still permitted.
- Additionally, the `stratum_authority` MAY call `settle` with aggregated metering proofs at each netting cycle.
- Stratum calculates net obligations across all opted-in channels and submits the minimum set of `settle` instructions.

### 13.3 Netting Engine Architecture

```
Agent A ──── Channel 1 ──── Service B
         ├── Channel 2 ──── Service C
         └── Channel 3 ──── Service D

All metering proofs ──→ Stratum Netting Engine
                              │
                        Net Calculation
                              │
                  Minimum Settlement Set
                              │
                        Solana Program
                       (batched settle)
```

The Stratum netting engine is an off-chain service operated by Valeo. It:

1. Collects metering proofs from all opted-in channels during a netting cycle.
2. Runs a multilateral netting algorithm to compute net obligations.
3. Produces a `NettingResult`: the minimum set of `(from_channel, to_recipient, amount)` transfers.
4. Submits batched `settle` instructions to the AMP program.
5. All channel states are updated in one netting cycle.

### 13.4 Netting Result Format

The netting engine produces the following structure:

```json
{
  "cycle_id": "uuid",
  "cycle_start": 1711234567,
  "cycle_end": 1711238167,
  "channels_included": 47,
  "settlements": [
    {
      "channel": "<channel_pda_base58>",
      "amount": 4500000,
      "metering_proof": "<serialized_proof>"
    }
  ],
  "total_gross": 12000000,
  "total_net": 7500000,
  "reduction_pct": 37.5
}
```

### 13.5 Security Considerations

- The `stratum_authority` is set by the funder at channel open or via a separate `set_stratum` instruction. Only the funder MAY change this field.
- Stratum can only call `settle` — it cannot close channels, modify balances directly, or change channel parameters.
- Each `settle` call still requires a valid metering proof signed by the recipient. Stratum aggregates proofs but does not forge them.
- If Stratum is unavailable, channels fall back to normal per-channel settlement by the recipient.

---

## 14. On-Chain Reputation

AMP includes a reputation system derived from channel history. Reputation scores are computed on-chain from verifiable settlement data. No external oracle or subjective rating — the score is a deterministic function of channel activity.

### 14.1 Reputation Program

**Program:** `amp-reputation`

**ReputationAccount** (PDA):

```
Seeds: [b"amp-reputation", entity_pubkey]
```

**Fields:**

| Field | Type | Size | Description |
|-------|------|------|-------------|
| bump | u8 | 1 | PDA bump seed |
| entity | Pubkey | 32 | The agent or service being scored |
| total_channels_opened | u64 | 8 | Lifetime channels (as funder or recipient) |
| total_channels_completed | u64 | 8 | Channels closed cleanly (no dispute) |
| total_volume | u64 | 8 | Lifetime settlement volume (token smallest unit) |
| total_settlements | u64 | 8 | Number of successful settlements |
| dispute_count | u64 | 8 | Number of channels closed with dispute |
| avg_channel_duration | i64 | 8 | Average channel lifetime in seconds |
| longest_streak | u64 | 8 | Longest consecutive clean settlements |
| current_streak | u64 | 8 | Current consecutive clean settlements |
| score | u64 | 8 | Computed reputation score (0-10000) |
| last_updated | i64 | 8 | Last score update Unix timestamp |

**Total account size:** 8 (discriminator) + 113 bytes = **121 bytes**

### 14.2 Score Calculation

The score is computed on-chain via a deterministic formula:

```
base_score = (total_channels_completed / total_channels_opened) * 5000

volume_bonus = min(log2(total_volume / 1_000_000) * 500, 2500)

streak_bonus = min(current_streak * 50, 1500)

dispute_penalty = dispute_count * 500

score = clamp(base_score + volume_bonus + streak_bonus - dispute_penalty, 0, 10000)
```

- `base_score`: Completion ratio scaled to 0-5000. An entity that completes all channels cleanly gets 5000.
- `volume_bonus`: Logarithmic scaling of total volume settled. 1 USDC = 0 bonus. 1,000 USDC = ~2,500 bonus (capped).
- `streak_bonus`: Linear reward for consecutive clean settlements. 10 = 500 bonus. 30+ = 1,500 (capped).
- `dispute_penalty`: 500 points deducted per dispute.

Score range: 0 to 10,000. Higher is better.

### 14.3 Reputation Updates via CPI

The `amp-channel` program calls `amp-reputation` via CPI on the following events:

| Event | CPI Action |
|-------|------------|
| `open_channel` | Increment `total_channels_opened` for both funder and recipient |
| `settle` | Increment `total_settlements`, add to `total_volume`, extend `current_streak` |
| `close_channel` (clean) | Increment `total_channels_completed`, update `avg_channel_duration` |
| `close_channel` (dispute) | Increment `dispute_count`, reset `current_streak` to 0 |

A "dispute" close is defined as a close where the funder and the metering proof disagree — specifically, where the funder closes the channel and the `final_amount` in the close instruction is less than the server's last submitted metering proof amount. The on-chain program detects this by comparing the close instruction's `final_amount` against `total_consumed + accumulated_since_last_settle`.

### 14.4 Reputation-Based Pricing

Services MAY offer tiered pricing based on agent reputation. The server publishes tiers in its discovery response:

```json
{
  "pricing": {
    "default": { "mode": "per-call", "rate": "10000" },
    "reputation_tiers": [
      { "min_score": 5000, "rate": "8000" },
      { "min_score": 8000, "rate": "5000" },
      { "min_score": 9500, "rate": "3000" }
    ]
  }
}
```

The server SDK reads the agent's ReputationAccount on-chain during channel validation and applies the highest matching tier. An agent with score 8500 would receive the 8000-tier rate of 5,000 units per call.

### 14.5 Reputation in the Registry

The `amp-registry` ServiceEntry's `reputation_score` field is populated from the service provider's ReputationAccount. Agents querying the registry can filter by minimum reputation, ensuring they only interact with proven services.

The registry MAY refresh `reputation_score` from the ReputationAccount periodically via a `refresh_reputation` instruction on `amp-registry`.

---

## 15. Channel Chaining

Channel chaining enables agent supply chains where a service can open downstream channels funded by an upstream channel. Value flows through the chain and settles via the normal settlement process or through Stratum netting.

### 15.1 The Problem

```
Agent A ──$10──> Service B (inference API)
                    │
                    ├── needs Service C (GPU compute) — costs $3
                    └── needs Service D (data source) — costs $1

Without chaining: Service B needs its own capital to pay C and D.
With chaining: Service B forwards from Agent A's channel.
```

An agent calls Service B, which needs to call Service C and Service D to fulfill the request. Without chaining, Service B must fund its own channels to C and D using its own capital. With chaining, Service B creates downstream channels funded from Agent A's upstream channel deposit.

### 15.2 Chain Instruction

The `chain_channel` instruction (Section 4.3.6) creates a new downstream ChannelState PDA funded from an upstream channel's vault.

**Key semantics:**
- The caller MUST be the recipient of the upstream channel.
- Funds transfer from the upstream vault to the new downstream vault.
- The downstream channel's `parent_channel` field points to the upstream PDA.
- The upstream channel's `balance` is reduced by the chained amount.
- The upstream channel's `child_channels` count is incremented.

### 15.3 Chain Depth Limits

- `chain_depth` MUST be strictly less than `max_chain_depth` to create a downstream channel.
- The default `max_chain_depth` is 3, supporting chains of: Agent -> Service -> Sub-service -> Sub-sub-service.
- The funder of the root channel MAY set `max_chain_depth` at channel open. Lower values restrict chaining; `max_chain_depth = 0` disables chaining entirely.

### 15.4 Settlement in Chains

Downstream channels settle independently. When a downstream channel settles, funds flow from the downstream vault to the downstream recipient. The upstream channel's balance was already reduced when the downstream channel was created (funds transferred to downstream vault).

With Stratum netting, the entire chain settles in one cycle:

1. Service B's metering with Agent A -> net owed
2. Service C's metering with Service B -> net owed
3. Service D's metering with Service B -> net owed
4. Stratum nets all obligations: minimum transfers executed

### 15.5 Closing Chained Channels

Closing works bottom-up:
1. Leaf channels (no children) MUST be closed first.
2. A channel with `child_channels > 0` MUST NOT be closed until all downstream channels are closed.
3. When a downstream channel closes, its `parent_channel`'s `child_channels` count is decremented.
4. Remaining balance from a closed downstream channel returns to the upstream vault (not to the downstream channel's funder, since the funds originated from the upstream channel).

### 15.6 Security in Chains

- Only the upstream recipient can create downstream channels. The upstream funder cannot — this prevents unauthorized fund forwarding.
- Each downstream channel is an independent PDA. The downstream recipient cannot access the upstream vault directly.
- The upstream funder (Agent A) can discover all downstream channels by scanning for ChannelState PDAs with `parent_channel` pointing to their channel.
- Chain depth limits prevent infinite or excessively deep chains.
- The upstream funder retains the ability to close the upstream channel, which requires all downstream channels to be closed first — giving the funder ultimate control over fund recovery.

### 15.7 Example: Agent Supply Chain

```typescript
// Service B receives a request and needs GPU compute from Service C
const downstreamChannel = await serviceB.chainChannel({
  upstream: agentAChannel,
  to: serviceCPubkey,
  amount: 3_000_000,       // 3 USDC from Agent A's channel
  rateLimit: 1_000_000,
  settleInterval: 3600,
});

// Service B calls Service C using the downstream channel
const gpuResult = await downstreamChannel.fetch(
  "https://gpu-service.com/v1/compute",
  { method: "POST", body: requestPayload }
);

// Agent A's $10 channel now has:
//   $7 available for direct use by Service B
//   $3 allocated to Service C via chain
```

---

## References

- [Solana Anchor Framework](https://www.anchor-lang.com/)
- [SPL Token Program](https://spl.solana.com/token)
- [Ed25519 Precompile](https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program) (`Ed25519SigVerify111111111111111111111111111`)
- [x402 Protocol](https://github.com/coinbase/x402)
- [RFC 2119 — Key Words](https://www.rfc-editor.org/rfc/rfc2119)
