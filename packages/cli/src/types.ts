export interface AmpConfig {
  network: string;
  walletPath: string;
  defaultBudget: string;
  token: string;
  programId: string;
  rpcUrl: string;
}

export interface ChannelCacheEntry {
  pda: string;
  recipient: string;
  nonce: number;
  lastSeq: number;
  openedAt: string;
}

export interface ChannelCache {
  channels: Record<string, ChannelCacheEntry>;
}

export interface GlobalOptions {
  network?: string;
  wallet?: string;
  budget?: string;
  token?: string;
  verbose?: boolean;
  json?: boolean;
}
