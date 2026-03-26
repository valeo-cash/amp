"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Settler = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const amp_core_1 = require("@valeo/amp-core");
/**
 * Auto-settlement engine.
 * Periodically settles channels that have accumulated usage
 * by submitting the `settle` instruction to the AMP program.
 */
class Settler {
    connection;
    program;
    wallet;
    meter;
    intervalSeconds;
    timer = null;
    settling = false;
    constructor(connection, program, wallet, meter, intervalSeconds) {
        this.connection = connection;
        this.program = program;
        this.wallet = wallet;
        this.meter = meter;
        this.intervalSeconds = intervalSeconds;
    }
    /** Start the auto-settlement loop. */
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => void this.settleAll(), this.intervalSeconds * 1000);
    }
    /** Stop the auto-settlement loop. */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    /** Manually settle a specific channel. Returns the transaction signature. */
    async settleChannel(channelPDA) {
        const key = channelPDA.toBase58();
        const channelState = await (0, amp_core_1.fetchChannel)(channelPDA, this.program);
        if (!channelState) {
            throw new Error(`Channel not found: ${key}`);
        }
        const proof = this.meter.generateProof(key, this.wallet);
        const [vaultPDA] = (0, amp_core_1.deriveVaultPDA)(channelPDA, this.program.programId);
        const recipientTokenAccount = await this.connection.getTokenAccountsByOwner(this.wallet.publicKey, {
            mint: channelState.mint,
        });
        if (recipientTokenAccount.value.length === 0) {
            throw new Error(`No token account found for recipient ${this.wallet.publicKey.toBase58()}`);
        }
        const txSig = await this.program.methods
            .settle(new anchor_1.BN(proof.amount))
            .accounts({
            authority: this.wallet.publicKey,
            channelState: channelPDA,
            vault: vaultPDA,
            recipientTokenAccount: recipientTokenAccount.value[0].pubkey,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .signers([this.wallet])
            .rpc();
        this.meter.resetUsage(key);
        return txSig;
    }
    /** Settle all channels with accumulated usage. */
    async settleAll() {
        if (this.settling)
            return new Map();
        this.settling = true;
        const results = new Map();
        const channels = this.meter.getChannelsWithUsage();
        for (const channelKey of channels) {
            try {
                const txSig = await this.settleChannel(new web3_js_1.PublicKey(channelKey));
                results.set(channelKey, txSig);
            }
            catch (err) {
                console.error(`AMP: settlement failed for ${channelKey}:`, err);
            }
        }
        this.settling = false;
        return results;
    }
}
exports.Settler = Settler;
//# sourceMappingURL=settler.js.map