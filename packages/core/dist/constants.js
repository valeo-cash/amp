"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMP_VERSION = exports.CHANNEL_STATE_SIZE = exports.MAX_SETTLE_INTERVAL = exports.MIN_SETTLE_INTERVAL = exports.MAX_CHAIN_DEPTH = exports.USDC_DECIMALS = exports.USDC_MINT_DEVNET = exports.USDC_MINT = exports.VAULT_SEED = exports.CHANNEL_SEED = exports.AMP_PROGRAM_ID = void 0;
const web3_js_1 = require("@solana/web3.js");
exports.AMP_PROGRAM_ID = new web3_js_1.PublicKey("AMPchanneLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
exports.CHANNEL_SEED = Buffer.from("amp-channel");
exports.VAULT_SEED = Buffer.from("amp-vault");
exports.USDC_MINT = new web3_js_1.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
exports.USDC_MINT_DEVNET = new web3_js_1.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
exports.USDC_DECIMALS = 6;
exports.MAX_CHAIN_DEPTH = 3;
exports.MIN_SETTLE_INTERVAL = 60;
exports.MAX_SETTLE_INTERVAL = 86_400 * 30;
exports.CHANNEL_STATE_SIZE = 8 + 329;
exports.AMP_VERSION = "1.0";
//# sourceMappingURL=constants.js.map