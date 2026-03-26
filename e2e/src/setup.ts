import { Connection, Keypair } from "@solana/web3.js";
import {
  DEVNET_URL,
  transferSol,
  createTestMint,
  fundTokenAccount,
  logSection,
  logStep,
  logSuccess,
} from "./utils";
import * as fs from "fs";
import * as path from "path";

async function main() {
  logSection("AMP Devnet Setup");

  const connection = new Connection(DEVNET_URL, "confirmed");

  // Load deployer wallet (already funded from deployment)
  const deployerKeyPath = path.join(
    process.env.HOME || "~",
    ".config",
    "solana",
    "id.json"
  );
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(deployerKeyPath, "utf-8")))
  );
  logStep(0, `Deployer: ${deployer.publicKey.toBase58()}`);

  logStep(1, "Generating test keypairs...");
  const funder = Keypair.generate();
  const recipient = Keypair.generate();
  const subAgent = Keypair.generate();

  logStep(2, "Transferring SOL from deployer...");
  await transferSol(connection, deployer, funder.publicKey, 1);
  await transferSol(connection, deployer, recipient.publicKey, 1);
  await transferSol(connection, deployer, subAgent.publicKey, 0.5);

  logStep(3, "Creating test USDC mint...");
  const mint = await createTestMint(connection, funder);

  logStep(4, "Funding token accounts...");
  const funderAta = await fundTokenAccount(
    connection, funder, mint, funder.publicKey, 1000
  );
  const recipientAta = await fundTokenAccount(
    connection, funder, mint, recipient.publicKey, 0
  );
  const subAgentAta = await fundTokenAccount(
    connection, funder, mint, subAgent.publicKey, 100
  );

  logStep(5, "Saving test configuration...");
  const keysDir = path.join(__dirname, "..", ".keys");
  if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });

  fs.writeFileSync(
    path.join(keysDir, "funder.json"),
    JSON.stringify(Array.from(funder.secretKey))
  );
  fs.writeFileSync(
    path.join(keysDir, "recipient.json"),
    JSON.stringify(Array.from(recipient.secretKey))
  );
  fs.writeFileSync(
    path.join(keysDir, "sub-agent.json"),
    JSON.stringify(Array.from(subAgent.secretKey))
  );

  const config = {
    network: "devnet",
    rpcUrl: DEVNET_URL,
    mint: mint.toBase58(),
    funder: funder.publicKey.toBase58(),
    funderAta: funderAta.toBase58(),
    recipient: recipient.publicKey.toBase58(),
    recipientAta: recipientAta.toBase58(),
    subAgent: subAgent.publicKey.toBase58(),
    subAgentAta: subAgentAta.toBase58(),
  };
  fs.writeFileSync(
    path.join(keysDir, "config.json"),
    JSON.stringify(config, null, 2)
  );

  logSuccess("Setup complete!");
  console.log(`\n  Config saved to e2e/.keys/config.json`);
  console.log(`  Funder:    ${funder.publicKey.toBase58()}`);
  console.log(`  Recipient: ${recipient.publicKey.toBase58()}`);
  console.log(`  SubAgent:  ${subAgent.publicKey.toBase58()}`);
  console.log(`  Mint:      ${mint.toBase58()}`);
}

main().catch(console.error);
