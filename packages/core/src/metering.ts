import { Keypair } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import { createHash } from "crypto";
import { MeteringProof } from "./types";

/**
 * Build the SHA-256 digest for a metering proof.
 *
 * digest = SHA256(channel || amount || callCount || periodStart || periodEnd || seqStart || seqEnd)
 *
 * All integer fields are serialized as little-endian 8-byte buffers.
 */
export function buildProofDigest(
  channel: string,
  amount: number,
  callCount: number,
  periodStart: number,
  periodEnd: number,
  seqStart: number,
  seqEnd: number
): Buffer {
  const hash = createHash("sha256");
  hash.update(Buffer.from(channel, "utf-8"));

  const buf = Buffer.alloc(8);

  buf.writeBigUInt64LE(BigInt(amount));
  hash.update(Buffer.from(buf));

  buf.writeBigUInt64LE(BigInt(callCount));
  hash.update(Buffer.from(buf));

  buf.writeBigInt64LE(BigInt(periodStart));
  hash.update(Buffer.from(buf));

  buf.writeBigInt64LE(BigInt(periodEnd));
  hash.update(Buffer.from(buf));

  buf.writeBigUInt64LE(BigInt(seqStart));
  hash.update(Buffer.from(buf));

  buf.writeBigUInt64LE(BigInt(seqEnd));
  hash.update(Buffer.from(buf));

  return hash.digest();
}

/**
 * Sign a metering proof with the server's keypair.
 * Returns a complete MeteringProof with the server_signature field populated.
 */
export function signMeteringProof(
  proof: Omit<MeteringProof, "serverSignature">,
  serverKeypair: Keypair
): MeteringProof {
  const digest = buildProofDigest(
    proof.channel,
    proof.amount,
    proof.callCount,
    proof.periodStart,
    proof.periodEnd,
    proof.seqStart,
    proof.seqEnd
  );
  const signature = nacl.sign.detached(digest, serverKeypair.secretKey);

  return {
    ...proof,
    serverSignature: Buffer.from(signature).toString("base64"),
  };
}

/**
 * Verify a metering proof signature against a server's public key.
 */
export function verifyMeteringProof(
  proof: MeteringProof,
  serverPublicKey: Uint8Array
): boolean {
  const digest = buildProofDigest(
    proof.channel,
    proof.amount,
    proof.callCount,
    proof.periodStart,
    proof.periodEnd,
    proof.seqStart,
    proof.seqEnd
  );
  const signature = Buffer.from(proof.serverSignature, "base64");
  return nacl.sign.detached.verify(digest, signature, serverPublicKey);
}
