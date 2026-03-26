import { AmpErrorCode, AmpErrorHttpStatus } from "./types";

/**
 * Typed AMP protocol error with an error code and corresponding HTTP status.
 */
export class AmpError extends Error {
  public readonly code: AmpErrorCode;
  public readonly httpStatus: number;

  constructor(code: AmpErrorCode, message?: string) {
    super(message || code);
    this.code = code;
    this.httpStatus = AmpErrorHttpStatus[code];
    this.name = "AmpError";
  }

  toJSON(): { error: AmpErrorCode; message: string; status: number } {
    return {
      error: this.code,
      message: this.message,
      status: this.httpStatus,
    };
  }
}
