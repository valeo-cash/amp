"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveChannelPDA = deriveChannelPDA;
exports.deriveVaultPDA = deriveVaultPDA;
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("./constants");
/**
 * Derive the ChannelState PDA address.
 * Seeds: [b"amp-channel", funder, recipient, nonce_le_bytes]
 */
function deriveChannelPDA(funder, recipient, nonce, programId = constants_1.AMP_PROGRAM_ID) {
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(BigInt(nonce));
    return web3_js_1.PublicKey.findProgramAddressSync([constants_1.CHANNEL_SEED, funder.toBuffer(), recipient.toBuffer(), nonceBuf], programId);
}
/**
 * Derive the channel vault PDA address.
 * Seeds: [b"amp-vault", channel_state_pda]
 */
function deriveVaultPDA(channelState, programId = constants_1.AMP_PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([constants_1.VAULT_SEED, channelState.toBuffer()], programId);
}
//# sourceMappingURL=pda.js.map