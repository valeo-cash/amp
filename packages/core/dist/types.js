"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmpErrorHttpStatus = exports.AmpErrorCode = exports.ChannelStatus = void 0;
var ChannelStatus;
(function (ChannelStatus) {
    ChannelStatus[ChannelStatus["Active"] = 0] = "Active";
    ChannelStatus[ChannelStatus["Closed"] = 1] = "Closed";
})(ChannelStatus || (exports.ChannelStatus = ChannelStatus = {}));
var AmpErrorCode;
(function (AmpErrorCode) {
    AmpErrorCode["AMP_NO_CHANNEL"] = "AMP_NO_CHANNEL";
    AmpErrorCode["AMP_UNDERFUNDED"] = "AMP_UNDERFUNDED";
    AmpErrorCode["AMP_CLOSED"] = "AMP_CLOSED";
    AmpErrorCode["AMP_RATE_EXCEEDED"] = "AMP_RATE_EXCEEDED";
    AmpErrorCode["AMP_INVALID_PROOF"] = "AMP_INVALID_PROOF";
    AmpErrorCode["AMP_SETTLE_EARLY"] = "AMP_SETTLE_EARLY";
    AmpErrorCode["AMP_DEPOSIT_LOW"] = "AMP_DEPOSIT_LOW";
    AmpErrorCode["AMP_INVALID_SEQ"] = "AMP_INVALID_SEQ";
    AmpErrorCode["AMP_INVALID_SIG"] = "AMP_INVALID_SIG";
})(AmpErrorCode || (exports.AmpErrorCode = AmpErrorCode = {}));
exports.AmpErrorHttpStatus = {
    [AmpErrorCode.AMP_NO_CHANNEL]: 402,
    [AmpErrorCode.AMP_UNDERFUNDED]: 402,
    [AmpErrorCode.AMP_CLOSED]: 410,
    [AmpErrorCode.AMP_RATE_EXCEEDED]: 429,
    [AmpErrorCode.AMP_INVALID_PROOF]: 400,
    [AmpErrorCode.AMP_SETTLE_EARLY]: 425,
    [AmpErrorCode.AMP_DEPOSIT_LOW]: 400,
    [AmpErrorCode.AMP_INVALID_SEQ]: 400,
    [AmpErrorCode.AMP_INVALID_SIG]: 401,
};
//# sourceMappingURL=types.js.map