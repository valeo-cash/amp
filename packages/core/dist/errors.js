"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmpError = void 0;
const types_1 = require("./types");
/**
 * Typed AMP protocol error with an error code and corresponding HTTP status.
 */
class AmpError extends Error {
    code;
    httpStatus;
    constructor(code, message) {
        super(message || code);
        this.code = code;
        this.httpStatus = types_1.AmpErrorHttpStatus[code];
        this.name = "AmpError";
    }
    toJSON() {
        return {
            error: this.code,
            message: this.message,
            status: this.httpStatus,
        };
    }
}
exports.AmpError = AmpError;
//# sourceMappingURL=errors.js.map