# AMP Protocol Specification

**Version**: 0.1 (Draft)
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

### 4.1 Program

**Program ID**: `AMPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (placeholder — final address assigned at deployment)

The AMP program is a Solana program (Anchor-compatible) that manages channel state, token custody, and settlement verification.

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

**Total account size:** 8 (discriminator) + 243 = **251 bytes**

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
| recipient | Yes | Yes | Channel recipient (submits settlement) |
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
- `channel_state.recipient` MUST equal the `recipient` account.

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

AMP is transport agnostic. This section defines how AMP metadata is carried on each supported transport.

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
| Transport | HTTP only | HTTP + MCP/JSON-RPC | HTTP + WebSocket + gRPC + MQTT + TCP |
| Chain / Network | Base (EVM) | Tempo (primary), Solana, Lightning, cards, Stripe | Solana native (direct, no intermediary) |
| Settlement | Immediate per-call | Per-call (charge) / per-channel (session) | Net cleared at intervals (1 tx per period) |
| On-chain Txns / 1K calls | 1,000 | 2 (session: open + close) | ~3 (open + settle + close) |
| Payment Methods | USDC on Base | Multi-method (Tempo, Stripe, cards, Lightning, Solana) | USDC (SPL) on Solana |
| Streaming Support | None | SSE with voucher renewal | Native (any transport) |
| Credit Support | None | None | Native (ACE integration ready) |
| Delegation | None | None | Native (delegate instruction) |
| On-chain Composability | Limited (EVM) | Varies by payment method | Full Solana DeFi (PDA is readable/composable) |
| Fiat Support | No | Yes (Stripe, cards) | No (crypto-native) |

### 10.3 Key Differentiators

MPP sessions and AMP channels are comparable in transaction efficiency. The differences are architectural:

1. **Solana-native state.** AMP's ChannelState PDA is a first-class Solana account. Other programs can read it, compose with it in CPIs, and build on top of it. MPP's channel state lives on whatever underlying payment network is negotiated.
2. **Net settlement.** AMP settles net amounts at intervals via signed metering proofs. MPP sessions use cumulative vouchers settled at channel close.
3. **Delegation.** AMP's `delegate` instruction enables on-chain agent-to-agent budget forwarding. MPP has no equivalent mechanism.
4. **Credit readiness.** AMP's channel model supports credit extension via reputation-based deposit reduction. MPP requires upfront deposits.
5. **Transport breadth.** AMP defines bindings for gRPC, MQTT, and raw TCP in addition to HTTP. MPP covers HTTP and MCP/JSON-RPC.
6. **Payment method flexibility.** MPP supports multiple payment methods (Tempo, Stripe, cards, Lightning, Solana). AMP is Solana-only. This is a trade-off, not an advantage.

---

## References

- [Solana Anchor Framework](https://www.anchor-lang.com/)
- [SPL Token Program](https://spl.solana.com/token)
- [Ed25519 Precompile](https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program) (`Ed25519SigVerify111111111111111111111111111`)
- [x402 Protocol](https://github.com/coinbase/x402)
- [RFC 2119 — Key Words](https://www.rfc-editor.org/rfc/rfc2119)
