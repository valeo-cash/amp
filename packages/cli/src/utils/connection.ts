import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { loadConfig } from "./config";

const AMP_PROGRAM_ID_MAINNET = "2d1B2PmumwYWuR82AbXAARTL1nrn8N7Vu9bLXTXUDmVA";
const AMP_PROGRAM_ID_DEVNET = "2KQCaQ9j8YtewZ4QjmDfnsVANZXLBcPSYFhAj2eUNaPP";

// Bundled IDL ships with the npm package
const IDL = require("../../idl/amp_channel.json");

export function getConnection(rpcUrl?: string): Connection {
  const config = loadConfig();
  return new Connection(rpcUrl || config.rpcUrl, "confirmed");
}

export function getProgram(wallet: Keypair, connection?: Connection): Program {
  const conn = connection || getConnection();
  const provider = new AnchorProvider(conn, new Wallet(wallet), {
    commitment: "confirmed",
  });
  return new Program(IDL, provider);
}

export function getProgramId(): PublicKey {
  const config = loadConfig();
  if (config.network.includes("mainnet")) {
    return new PublicKey(AMP_PROGRAM_ID_MAINNET);
  }
  return new PublicKey(AMP_PROGRAM_ID_DEVNET);
}

export function getNetworkLabel(): string {
  const config = loadConfig();
  return config.network.includes("mainnet") ? "mainnet-beta" : "devnet";
}

export function isMainnet(): boolean {
  return loadConfig().network.includes("mainnet");
}
