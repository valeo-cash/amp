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
exports.ChannelStateCache = void 0;
exports.verifyAmpSig = verifyAmpSig;
exports.validateRequest = validateRequest;
const nacl = __importStar(require("tweetnacl"));
const bs58_1 = __importDefault(require("bs58"));
const amp_core_1 = require("@valeo/amp-core");
const CACHE_TTL_MS = 30_000;
/**
 * In-memory channel state cache with TTL-based expiry.
 */
class ChannelStateCache {
    entries = new Map();
    seqTracker = new Map();
    get(key) {
        const entry = this.entries.get(key);
        if (!entry)
            return undefined;
        if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.state;
    }
    set(key, value) {
        this.entries.set(key, { state: value, fetchedAt: Date.now() });
    }
    delete(key) {
        this.entries.delete(key);
        this.seqTracker.delete(key);
    }
    getLastSeq(channelKey) {
        return this.seqTracker.get(channelKey) ?? 0;
    }
    setLastSeq(channelKey, seq) {
        this.seqTracker.set(channelKey, seq);
    }
}
exports.ChannelStateCache = ChannelStateCache;
/**
 * Verify that an AMP-Sig is a valid Ed25519 signature of AMP-Seq
 * by the given public key.
 */
function verifyAmpSig(seq, sig, pubkey) {
    try {
        const message = Buffer.alloc(8);
        message.writeBigUInt64LE(BigInt(seq));
        const sigBytes = bs58_1.default.decode(sig);
        return nacl.sign.detached.verify(message, sigBytes, pubkey.toBytes());
    }
    catch {
        return false;
    }
}
/**
 * Validate an incoming AMP request.
 *
 * 1. Fetch/cache ChannelState
 * 2. Verify channel is Active
 * 3. Verify balance > 0
 * 4. Verify ed25519 signature of seq by funder (or delegate)
 * 5. Verify seq > last_seen_seq
 */
async function validateRequest(channelPDA, seq, sig, program, cache) {
    const key = channelPDA.toBase58();
    let channelState = cache.get(key);
    if (!channelState) {
        channelState = (await (0, amp_core_1.fetchChannel)(channelPDA, program)) ?? undefined;
        if (!channelState) {
            return { valid: false, error: amp_core_1.AmpErrorCode.AMP_NO_CHANNEL };
        }
        cache.set(key, channelState);
    }
    if (channelState.status !== amp_core_1.ChannelStatus.Active) {
        return { valid: false, error: amp_core_1.AmpErrorCode.AMP_CLOSED };
    }
    if (channelState.balance <= BigInt(0)) {
        return { valid: false, error: amp_core_1.AmpErrorCode.AMP_UNDERFUNDED };
    }
    const isFunder = verifyAmpSig(seq, sig, channelState.funder);
    const isDelegate = channelState.delegate !== null &&
        verifyAmpSig(seq, sig, channelState.delegate);
    if (!isFunder && !isDelegate) {
        return { valid: false, error: amp_core_1.AmpErrorCode.AMP_INVALID_SIG };
    }
    const lastSeq = cache.getLastSeq(key);
    if (seq <= lastSeq) {
        return { valid: false, error: amp_core_1.AmpErrorCode.AMP_INVALID_SEQ };
    }
    cache.setLastSeq(key, seq);
    return {
        valid: true,
        context: {
            channel: channelPDA,
            channelState,
            seq,
            balance: channelState.balance,
            isDelegate: !isFunder && isDelegate,
        },
    };
}
//# sourceMappingURL=validator.js.map