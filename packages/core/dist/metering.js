"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProofDigest = buildProofDigest;
exports.signMeteringProof = signMeteringProof;
exports.verifyMeteringProof = verifyMeteringProof;
const nacl = __importStar(require("tweetnacl"));
const crypto_1 = require("crypto");
/**
 * Build the SHA-256 digest for a metering proof.
 *
 * digest = SHA256(channel || amount || callCount || periodStart || periodEnd || seqStart || seqEnd)
 *
 * All integer fields are serialized as little-endian 8-byte buffers.
 */
function buildProofDigest(channel, amount, callCount, periodStart, periodEnd, seqStart, seqEnd) {
    const hash = (0, crypto_1.createHash)("sha256");
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
function signMeteringProof(proof, serverKeypair) {
    const digest = buildProofDigest(proof.channel, proof.amount, proof.callCount, proof.periodStart, proof.periodEnd, proof.seqStart, proof.seqEnd);
    const signature = nacl.sign.detached(digest, serverKeypair.secretKey);
    return {
        ...proof,
        serverSignature: Buffer.from(signature).toString("base64"),
    };
}
/**
 * Verify a metering proof signature against a server's public key.
 */
function verifyMeteringProof(proof, serverPublicKey) {
    const digest = buildProofDigest(proof.channel, proof.amount, proof.callCount, proof.periodStart, proof.periodEnd, proof.seqStart, proof.seqEnd);
    const signature = Buffer.from(proof.serverSignature, "base64");
    return nacl.sign.detached.verify(digest, signature, serverPublicKey);
}
//# sourceMappingURL=metering.js.map