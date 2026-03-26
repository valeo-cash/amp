import { Keypair } from "@solana/web3.js";
import { MeteringProof } from "./types";
/**
 * Build the SHA-256 digest for a metering proof.
 *
 * digest = SHA256(channel || amount || callCount || periodStart || periodEnd || seqStart || seqEnd)
 *
 * All integer fields are serialized as little-endian 8-byte buffers.
 */
export declare function buildProofDigest(channel: string, amount: number, callCount: number, periodStart: number, periodEnd: number, seqStart: number, seqEnd: number): Buffer;
/**
 * Sign a metering proof with the server's keypair.
 * Returns a complete MeteringProof with the server_signature field populated.
 */
export declare function signMeteringProof(proof: Omit<MeteringProof, "serverSignature">, serverKeypair: Keypair): MeteringProof;
/**
 * Verify a metering proof signature against a server's public key.
 */
export declare function verifyMeteringProof(proof: MeteringProof, serverPublicKey: Uint8Array): boolean;
//# sourceMappingURL=metering.d.ts.map