import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { loadConfig, getAmpDir } from "./config";

export function loadWallet(walletPath?: string): Keypair {
  const config = loadConfig();
  const p = walletPath || config.walletPath;
  if (!fs.existsSync(p)) {
    throw new Error(
      `Wallet not found at ${p}. Run \`amp wallet create\` first.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function createWallet(): { keypair: Keypair; path: string } {
  const dir = getAmpDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const walletPath = path.join(dir, "wallet.json");
  const keypair = Keypair.generate();
  fs.writeFileSync(
    walletPath,
    JSON.stringify(Array.from(keypair.secretKey))
  );
  return { keypair, path: walletPath };
}

export function walletExists(walletPath?: string): boolean {
  const config = loadConfig();
  return fs.existsSync(walletPath || config.walletPath);
}
