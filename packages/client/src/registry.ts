import { Connection, PublicKey } from "@solana/web3.js";

/** Placeholder for a ServiceEntry from the amp-registry program. */
export interface ServiceEntry {
  provider: PublicKey;
  endpoint: string;
  category: number;
  rate: bigint;
  token: PublicKey;
  minDeposit: bigint;
  settleInterval: number;
  description: string;
  reputation_score: bigint;
  total_settled: bigint;
  active_channels: number;
  active: boolean;
}

export interface RegistrySearchFilters {
  category?: string;
  maxRate?: string;
  token?: string;
  minReputation?: number;
  sortBy?: "reputation" | "rate" | "total_settled";
  limit?: number;
}

/**
 * Query the AMP Service Registry to discover services.
 *
 * The `amp-registry` program is not yet deployed. All methods throw
 * an error until the program is available on-chain. The API surface
 * is defined here so client code can be written against it today.
 */
export class AMPRegistry {
  constructor(
    private config: { connection: Connection; programId?: PublicKey }
  ) {}

  /**
   * Search for services by category, price, and reputation.
   * @throws Error — registry program not yet deployed.
   */
  async search(_filters: RegistrySearchFilters): Promise<ServiceEntry[]> {
    throw new Error(
      "AMP Registry program not yet deployed. Use direct channel opening instead."
    );
  }

  /**
   * Get a specific service entry by provider pubkey.
   * @throws Error — registry program not yet deployed.
   */
  async getService(_provider: PublicKey): Promise<ServiceEntry | null> {
    throw new Error(
      "AMP Registry program not yet deployed. Use direct channel opening instead."
    );
  }
}
