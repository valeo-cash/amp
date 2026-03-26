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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelManager = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const nacl = __importStar(require("tweetnacl"));
const bs58_1 = __importDefault(require("bs58"));
const amp_core_1 = require("@valeo/amp-core");
/**
 * Internal channel lifecycle manager.
 * Maps hostnames to channel PDAs, tracks sequence counters,
 * and submits on-chain instructions for open/close/top-up.
 */
class ChannelManager {
    wallet;
    connection;
    programId;
    hostChannels = new Map();
    seqCounters = new Map();
    channelHandles = new Map();
    nonceCounter = 0;
    program;
    constructor(wallet, connection, programId = amp_core_1.AMP_PROGRAM_ID) {
        this.wallet = wallet;
        this.connection = connection;
        this.programId = programId;
        const provider = new anchor_1.AnchorProvider(connection, new anchor_1.Wallet(wallet), { commitment: "confirmed" });
        this.program = new anchor_1.Program(require("../../../target/idl/amp_channel.json"), provider);
    }
    /** Check if a channel already exists for a given hostname. */
    getChannelForHost(host) {
        return this.hostChannels.get(host);
    }
    /** Get the handle (PDA + metadata) for a channel. */
    getHandle(channelPDA) {
        return this.channelHandles.get(channelPDA.toBase58());
    }
    /** Get all active channel handles. */
    getAllHandles() {
        return new Map(this.channelHandles);
    }
    /**
     * Open a channel for a host, using pricing from the server's manifest.
     * Returns the channel PDA.
     */
    async openChannel(host, pricing, depositHuman, mint, settleInterval) {
        const recipient = new web3_js_1.PublicKey(pricing.recipient);
        const nonce = this.nonceCounter++;
        const [channelPDA] = (0, amp_core_1.deriveChannelPDA)(this.wallet.publicKey, recipient, nonce, this.programId);
        const [vaultPDA] = (0, amp_core_1.deriveVaultPDA)(channelPDA, this.programId);
        const decimals = amp_core_1.USDC_DECIMALS;
        const depositAmount = Math.round(depositHuman * 10 ** decimals);
        const interval = settleInterval ?? pricing.pricing.default.settleInterval ?? 3600;
        const rateLimit = depositAmount;
        const funderAta = await (0, spl_token_1.getAssociatedTokenAddress)(mint, this.wallet.publicKey);
        await this.program.methods
            .openChannel(new anchor_1.BN(depositAmount), new anchor_1.BN(rateLimit), new anchor_1.BN(interval), new anchor_1.BN(nonce))
            .accounts({
            funder: this.wallet.publicKey,
            recipient,
            mint,
            channelState: channelPDA,
            vault: vaultPDA,
            funderTokenAccount: funderAta,
            systemProgram: web3_js_1.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .signers([this.wallet])
            .rpc();
        this.hostChannels.set(host, channelPDA);
        this.seqCounters.set(channelPDA.toBase58(), 0);
        this.channelHandles.set(channelPDA.toBase58(), {
            pda: channelPDA,
            vault: vaultPDA,
            recipient,
            balance: BigInt(depositAmount),
        });
        return channelPDA;
    }
    /**
     * Get the next sequence number and sign it with the wallet keypair.
     * Returns `{ seq, sig }` where sig is base58-encoded Ed25519 signature.
     */
    getNextSeqAndSig(channelPDA) {
        const key = channelPDA.toBase58();
        const current = this.seqCounters.get(key) ?? 0;
        const seq = current + 1;
        this.seqCounters.set(key, seq);
        const message = Buffer.alloc(8);
        message.writeBigUInt64LE(BigInt(seq));
        const signature = nacl.sign.detached(message, this.wallet.secretKey);
        return { seq, sig: bs58_1.default.encode(signature) };
    }
    /**
     * Top up an existing channel with additional funds.
     * Returns the transaction signature.
     */
    async topUp(channelPDA, amountHuman, mint) {
        const amount = Math.round(amountHuman * 10 ** amp_core_1.USDC_DECIMALS);
        const [vaultPDA] = (0, amp_core_1.deriveVaultPDA)(channelPDA, this.programId);
        const funderAta = await (0, spl_token_1.getAssociatedTokenAddress)(mint, this.wallet.publicKey);
        const txSig = await this.program.methods
            .topUp(new anchor_1.BN(amount))
            .accounts({
            funder: this.wallet.publicKey,
            channelState: channelPDA,
            vault: vaultPDA,
            funderTokenAccount: funderAta,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .signers([this.wallet])
            .rpc();
        const handle = this.channelHandles.get(channelPDA.toBase58());
        if (handle) {
            handle.balance += BigInt(amount);
        }
        return txSig;
    }
    /**
     * Close a specific channel. Refunds remaining balance to funder.
     * Returns the transaction signature.
     */
    async closeChannel(channelPDA) {
        const channelState = await (0, amp_core_1.fetchChannel)(channelPDA, this.program);
        if (!channelState) {
            throw new Error(`Channel not found: ${channelPDA.toBase58()}`);
        }
        const [vaultPDA] = (0, amp_core_1.deriveVaultPDA)(channelPDA, this.programId);
        const funderAta = await (0, spl_token_1.getAssociatedTokenAddress)(channelState.mint, this.wallet.publicKey);
        const recipientAta = await (0, spl_token_1.getAssociatedTokenAddress)(channelState.mint, channelState.recipient);
        const txSig = await this.program.methods
            .closeChannel(new anchor_1.BN(0))
            .accounts({
            closer: this.wallet.publicKey,
            funder: this.wallet.publicKey,
            recipient: channelState.recipient,
            channelState: channelPDA,
            vault: vaultPDA,
            funderTokenAccount: funderAta,
            recipientTokenAccount: recipientAta,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
            parentChannelState: null,
        })
            .signers([this.wallet])
            .rpc();
        const key = channelPDA.toBase58();
        this.channelHandles.delete(key);
        this.seqCounters.delete(key);
        for (const [host, pda] of this.hostChannels) {
            if (pda.equals(channelPDA)) {
                this.hostChannels.delete(host);
                break;
            }
        }
        return txSig;
    }
    /**
     * Close all open channels. Returns a map of channel PDA -> tx signature.
     */
    async closeAllChannels() {
        const results = new Map();
        const pdas = Array.from(this.channelHandles.keys());
        for (const key of pdas) {
            try {
                const txSig = await this.closeChannel(new web3_js_1.PublicKey(key));
                results.set(key, txSig);
            }
            catch (err) {
                console.error(`AMP: failed to close channel ${key}:`, err);
            }
        }
        return results;
    }
}
exports.ChannelManager = ChannelManager;
//# sourceMappingURL=channel-manager.js.map