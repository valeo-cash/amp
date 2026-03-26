import { AmpErrorCode } from "./types";
/**
 * Typed AMP protocol error with an error code and corresponding HTTP status.
 */
export declare class AmpError extends Error {
    readonly code: AmpErrorCode;
    readonly httpStatus: number;
    constructor(code: AmpErrorCode, message?: string);
    toJSON(): {
        error: AmpErrorCode;
        message: string;
        status: number;
    };
}
//# sourceMappingURL=errors.d.ts.map