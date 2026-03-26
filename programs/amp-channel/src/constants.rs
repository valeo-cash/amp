/// PDA seed for ChannelState accounts.
pub const CHANNEL_SEED: &[u8] = b"amp-channel";

/// PDA seed for channel vault token accounts.
pub const CHANNEL_VAULT_SEED: &[u8] = b"amp-vault";

/// Default maximum chain depth (Agent -> Service -> Sub-service -> Sub-sub-service).
pub const MAX_CHAIN_DEPTH: u8 = 3;

/// Minimum settlement interval in seconds (1 minute).
pub const MIN_SETTLE_INTERVAL: i64 = 60;

/// Maximum settlement interval in seconds (30 days).
pub const MAX_SETTLE_INTERVAL: i64 = 86_400 * 30;

/// Total account size for ChannelState: 8 (discriminator) + 329 (fields).
pub const CHANNEL_STATE_SIZE: usize = 8 + 329;
