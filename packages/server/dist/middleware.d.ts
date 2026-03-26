import { EventEmitter } from "events";
import { AMPServerConfig, AMPMiddlewareShorthand, AMPContext } from "./types";
declare global {
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
export declare class AMP extends EventEmitter {
    private config;
    private cache;
    private meter;
    private settler;
    private program;
    constructor(config: AMPServerConfig);
    /**
     * One-liner middleware factory.
     *
     * Usage: `app.use(AMP.middleware({ rate: "0.001/call" }))`
     *
     * Generates a temporary keypair for the server. In production, provide
     * a full AMPServerConfig with a persistent keypair.
     */
    static middleware(shorthand: AMPMiddlewareShorthand): (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void;
    /**
     * Returns Express middleware that validates AMP channel credentials
     * on every request and responds with 402 if no valid channel is present.
     */
    middleware(): (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void;
    /** Manually trigger settlement for all channels. */
    settleAll(): Promise<Map<string, string>>;
    /** Stop the auto-settlement loop. */
    stop(): void;
    /** Get the well-known pricing manifest as JSON. */
    getPricingManifest(): import("@valeo/amp-core").AmpPricingManifest;
    /**
     * Returns an Express router that serves `/.well-known/amp.json`.
     * Usage: `app.use(amp.wellKnownRouter())`
     */
    wellKnownHandler(): (_req: ExpressRequest, res: ExpressResponse) => void;
    private handleRequest;
}
export {};
//# sourceMappingURL=middleware.d.ts.map