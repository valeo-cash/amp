import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { AmpError, AmpErrorCode, AMP_PROGRAM_ID, USDC_MINT } from "@valeo/amp-core";
import { EventEmitter } from "events";
import { AMPServerConfig, AMPMiddlewareShorthand, AMPContext, AMPServerEvents } from "./types";
import { ChannelStateCache, validateRequest } from "./validator";
import { Meter } from "./meter";
import { Settler } from "./settler";
import { buildPricingHeaders, buildPricingManifest, resolveShorthand } from "./pricing";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      amp?: AMPContext;
    }
  }
}

type ExpressRequest = {
  headers: Record<string, string | string[] | undefined>;
  path?: string;
  url?: string;
  amp?: AMPContext;
};
type ExpressResponse = {
  status: (code: number) => ExpressResponse;
  set: (headers: Record<string, string>) => ExpressResponse;
  json: (body: unknown) => void;
};
type NextFunction = () => void;

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
export class AMP extends EventEmitter {
  private config: AMPServerConfig;
  private cache: ChannelStateCache;
  private meter: Meter;
  private settler: Settler;
  private program: Program;

  constructor(config: AMPServerConfig) {
    super();
    this.config = config;
    this.cache = new ChannelStateCache();
    this.meter = new Meter(config.pricing, config.routes);

    const provider = new AnchorProvider(
      config.connection,
      new Wallet(config.wallet),
      { commitment: "confirmed" }
    );

    // Load program from IDL — the IDL is expected to be available at runtime.
    // In production, the program would be loaded from the IDL registry or bundled.
    this.program = new Program(
      require("../../target/idl/amp_channel.json"),
      provider
    );

    this.settler = new Settler(
      config.connection,
      this.program,
      config.wallet,
      this.meter,
      config.settlement?.interval ?? config.pricing.settleInterval
    );

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
  static middleware(shorthand: AMPMiddlewareShorthand) {
    const pricing = resolveShorthand(shorthand);
    const wallet = Keypair.generate();
    const connection = new Connection("https://api.mainnet-beta.solana.com");

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
  middleware(): (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void {
    return (req, res, next) => {
      void this.handleRequest(req, res, next);
    };
  }

  /** Manually trigger settlement for all channels. */
  async settleAll(): Promise<Map<string, string>> {
    return this.settler.settleAll();
  }

  /** Stop the auto-settlement loop. */
  stop(): void {
    this.settler.stop();
  }

  /** Get the well-known pricing manifest as JSON. */
  getPricingManifest() {
    return buildPricingManifest(this.config);
  }

  /**
   * Returns an Express router that serves `/.well-known/amp.json`.
   * Usage: `app.use(amp.wellKnownRouter())`
   */
  wellKnownHandler() {
    const manifest = this.getPricingManifest();
    return (_req: ExpressRequest, res: ExpressResponse) => {
      res.json(manifest);
    };
  }

  private async handleRequest(
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction
  ): Promise<void> {
    const channelHeader = req.headers["amp-channel"] as string | undefined;
    const seqHeader = req.headers["amp-seq"] as string | undefined;
    const sigHeader = req.headers["amp-sig"] as string | undefined;

    if (!channelHeader || !seqHeader || !sigHeader) {
      const route = req.path ?? req.url ?? "/";
      const headers = buildPricingHeaders(this.config, route);
      res.status(402).set(headers).json(
        new AmpError(
          AmpErrorCode.AMP_NO_CHANNEL,
          "No valid AMP channel for this request. Open a channel to access this endpoint."
        ).toJSON()
      );
      return;
    }

    let channelPDA: PublicKey;
    try {
      channelPDA = new PublicKey(channelHeader);
    } catch {
      res.status(400).json(
        new AmpError(
          AmpErrorCode.AMP_NO_CHANNEL,
          "Invalid AMP-Channel header: not a valid base58 public key."
        ).toJSON()
      );
      return;
    }

    const seq = parseInt(seqHeader, 10);
    if (isNaN(seq) || seq < 0) {
      res.status(400).json(
        new AmpError(
          AmpErrorCode.AMP_INVALID_SEQ,
          "Invalid AMP-Seq header: must be a non-negative integer."
        ).toJSON()
      );
      return;
    }

    const result = await validateRequest(
      channelPDA,
      seq,
      sigHeader,
      this.program,
      this.cache
    );

    if (!result.valid || !result.context) {
      const error = new AmpError(result.error!);
      res.status(error.httpStatus).json(error.toJSON());
      return;
    }

    req.amp = result.context;

    const route = req.path ?? req.url ?? "/";
    this.meter.recordCall(channelPDA.toBase58(), seq, route);

    next();
  }
}
