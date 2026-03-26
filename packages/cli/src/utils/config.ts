import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { AmpConfig, ChannelCache, ChannelCacheEntry } from "../types";

const AMP_DIR = path.join(os.homedir(), ".amp");
const CONFIG_PATH = path.join(AMP_DIR, "config.json");
const CHANNELS_PATH = path.join(AMP_DIR, "channels.json");

const DEFAULT_CONFIG: AmpConfig = {
  network: "solana:devnet",
  walletPath: path.join(AMP_DIR, "wallet.json"),
  defaultBudget: "1000000",
  token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  programId: "2d1B2PmumwYWuR82AbXAARTL1nrn8N7Vu9bLXTXUDmVA",
  rpcUrl: "https://api.devnet.solana.com",
};

function ensureDir(): void {
  if (!fs.existsSync(AMP_DIR)) fs.mkdirSync(AMP_DIR, { recursive: true });
}

export function loadConfig(): AmpConfig {
  ensureDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  return { ...DEFAULT_CONFIG, ...raw };
}

export function saveConfig(config: AmpConfig): void {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  if (key === "network") {
    config.network = value;
    config.rpcUrl = value.includes("mainnet")
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com";
  } else if (key in config) {
    (config as unknown as Record<string, string>)[key] = value;
  } else {
    throw new Error(`Unknown config key: ${key}`);
  }
  saveConfig(config);
}

export function loadChannelCache(): ChannelCache {
  ensureDir();
  if (!fs.existsSync(CHANNELS_PATH)) return { channels: {} };
  return JSON.parse(fs.readFileSync(CHANNELS_PATH, "utf-8"));
}

export function saveChannelCache(cache: ChannelCache): void {
  ensureDir();
  fs.writeFileSync(CHANNELS_PATH, JSON.stringify(cache, null, 2));
}

export function cacheChannel(recipient: string, entry: ChannelCacheEntry): void {
  const cache = loadChannelCache();
  cache.channels[recipient] = entry;
  saveChannelCache(cache);
}

export function getCachedChannel(recipient: string): ChannelCacheEntry | null {
  const cache = loadChannelCache();
  return cache.channels[recipient] || null;
}

export function removeCachedChannel(recipient: string): void {
  const cache = loadChannelCache();
  delete cache.channels[recipient];
  saveChannelCache(cache);
}

export function getAmpDir(): string {
  return AMP_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
