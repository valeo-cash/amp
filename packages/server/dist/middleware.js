"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMP = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const amp_core_1 = require("@valeo/amp-core");
const events_1 = require("events");
const validator_1 = require("./validator");
const meter_1 = require("./meter");
const settler_1 = require("./settler");
const pricing_1 = require("./pricing");
/**
 * AMP server SDK.
 *
 * Two usage patterns:
 *
 * 1. One-liner shorthand:
 *    `app.use(AMP.middleware({ rate: "0.001/call" }))`
 *
 * 2. Full config:
 *    ```
 *    const amp = new AMP({ wallet, connection, pricing, ... })
 *    app.use(amp.middleware())
 *    ```
 */
class AMP extends events_1.EventEmitter {
    config;
    cache;
    meter;
    settler;
    program;
    constructor(config) {
        super();
        this.config = config;
        this.cache = new validator_1.ChannelStateCache();
        this.meter = new meter_1.Meter(config.pricing, config.routes);
        const provider = new anchor_1.AnchorProvider(config.connection, new anchor_1.Wallet(config.wallet), { commitment: "confirmed" });
        // Load program from IDL — the IDL is expected to be available at runtime.
        // In production, the program would be loaded from the IDL registry or bundled.
        this.program = new anchor_1.Program(require("../../target/idl/amp_channel.json"), provider);
        this.settler = new settler_1.Settler(config.connection, this.program, config.wallet, this.meter, config.settlement?.interval ?? config.pricing.settleInterval);
        if (config.settlement?.auto !== false) {
            this.settler.start();
        }
    }
    /**
     * One-liner middleware factory.
     *
     * Usage: `app.use(AMP.middleware({ rate: "0.001/call" }))`
     *
     * Generates a temporary keypair for the server. In production, provide
     * a full AMPServerConfig with a persistent keypair.
     */
    static middleware(shorthand) {
        const pricing = (0, pricing_1.resolveShorthand)(shorthand);
        const wallet = web3_js_1.Keypair.generate();
        const connection = new web3_js_1.Connection("https://api.mainnet-beta.solana.com");
        const amp = new AMP({
            wallet,
            connection,
            pricing,
        });
        return amp.middleware();
    }
    /**
     * Returns Express middleware that validates AMP channel credentials
     * on every request and responds with 402 if no valid channel is present.
     */
    middleware() {
        return (req, res, next) => {
            void this.handleRequest(req, res, next);
        };
    }
    /** Manually trigger settlement for all channels. */
    async settleAll() {
        return this.settler.settleAll();
    }
    /** Stop the auto-settlement loop. */
    stop() {
        this.settler.stop();
    }
    /** Get the well-known pricing manifest as JSON. */
    getPricingManifest() {
        return (0, pricing_1.buildPricingManifest)(this.config);
    }
    /**
     * Returns an Express router that serves `/.well-known/amp.json`.
     * Usage: `app.use(amp.wellKnownRouter())`
     */
    wellKnownHandler() {
        const manifest = this.getPricingManifest();
        return (_req, res) => {
            res.json(manifest);
        };
    }
    async handleRequest(req, res, next) {
        const channelHeader = req.headers["amp-channel"];
        const seqHeader = req.headers["amp-seq"];
        const sigHeader = req.headers["amp-sig"];
        if (!channelHeader || !seqHeader || !sigHeader) {
            const route = req.path ?? req.url ?? "/";
            const headers = (0, pricing_1.buildPricingHeaders)(this.config, route);
            res.status(402).set(headers).json(new amp_core_1.AmpError(amp_core_1.AmpErrorCode.AMP_NO_CHANNEL, "No valid AMP channel for this request. Open a channel to access this endpoint.").toJSON());
            return;
        }
        let channelPDA;
        try {
            channelPDA = new web3_js_1.PublicKey(channelHeader);
        }
        catch {
            res.status(400).json(new amp_core_1.AmpError(amp_core_1.AmpErrorCode.AMP_NO_CHANNEL, "Invalid AMP-Channel header: not a valid base58 public key.").toJSON());
            return;
        }
        const seq = parseInt(seqHeader, 10);
        if (isNaN(seq) || seq < 0) {
            res.status(400).json(new amp_core_1.AmpError(amp_core_1.AmpErrorCode.AMP_INVALID_SEQ, "Invalid AMP-Seq header: must be a non-negative integer.").toJSON());
            return;
        }
        const result = await (0, validator_1.validateRequest)(channelPDA, seq, sigHeader, this.program, this.cache);
        if (!result.valid || !result.context) {
            const error = new amp_core_1.AmpError(result.error);
            res.status(error.httpStatus).json(error.toJSON());
            return;
        }
        req.amp = result.context;
        const route = req.path ?? req.url ?? "/";
        this.meter.recordCall(channelPDA.toBase58(), seq, route);
        next();
    }
}
exports.AMP = AMP;
//# sourceMappingURL=middleware.js.map