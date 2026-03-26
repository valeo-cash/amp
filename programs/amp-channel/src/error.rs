use anchor_lang::prelude::*;

#[error_code]
pub enum AmpError {
    #[msg("Channel is not active")]
    ChannelNotActive,

    #[msg("Channel balance is insufficient")]
    InsufficientBalance,

    #[msg("Settlement attempted before interval elapsed")]
    SettleTooEarly,

    #[msg("Settlement amount exceeds rate limit")]
    RateLimitExceeded,

    #[msg("Deposit below minimum")]
    DepositTooLow,

    #[msg("Invalid settle interval")]
    InvalidSettleInterval,

    #[msg("Rate limit must be greater than zero")]
    InvalidRateLimit,

    #[msg("Unauthorized: signer is not funder, recipient, or stratum authority")]
    Unauthorized,

    #[msg("Delegate limit exceeds channel balance")]
    DelegateLimitExceeded,

    #[msg("Delegate consumption exceeds limit")]
    DelegateOverLimit,

    #[msg("Chain depth exceeds maximum")]
    MaxChainDepthExceeded,

    #[msg("Cannot close channel with active child channels")]
    HasActiveChildren,

    #[msg("Chain amount exceeds available balance")]
    ChainAmountExceedsBalance,

    #[msg("Only the upstream recipient can create downstream channels")]
    NotUpstreamRecipient,

    #[msg("Invalid metering proof")]
    InvalidMeteringProof,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Arithmetic overflow")]
    Overflow,
}
