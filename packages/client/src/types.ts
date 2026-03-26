import { Keypair, PublicKey, Connection } from "@solana/web3.js";

export interface AMPClientConfig {
  /** Agent's Solana keypair */
  wallet: Keypair;
  /** Solana RPC connection */
  connection: Connection;
  /** Maximum spend budget in human units (e.g., 10.00 for $10 USDC) */
  budget: number;
  /** SPL token symbol or mint address. Default: "USDC" */
  token?: string | PublicKey;
  /** Solana network. Default: "solana:mainnet-beta" */
  network?: string;
  /** Auto-open channels on first request to a new host. Default: true */
  autoOpen?: boolean;
  /** Auto-top-up when channel balance is low. Default: true */
  autoTopUp?: boolean;
  /** Top up when balance drops below this fraction of initial deposit. Default: 0.2 */
  topUpThreshold?: number;
  /** Default deposit per channel in human units. If not set, uses budget. */
  defaultDeposit?: number;
  /** Requested settle interval in seconds. Server may override. Default: 3600 */
  settleInterval?: number;
  /** Maximum number of concurrent open channels. Default: 10 */
  maxChannels?: number;
  /** AMP program ID override (for devnet/testing). */
  programId?: PublicKey;
}

export interface FetchOptions extends globalThis.RequestInit {
  /** Use a specific channel for this request (bypasses auto-routing). */
  channel?: PublicKey;
}

export interface ChannelHandle {
  pda: PublicKey;
  vault: PublicKey;
  recipient: PublicKey;
  balance: bigint;
}
