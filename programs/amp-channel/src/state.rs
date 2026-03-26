use anchor_lang::prelude::*;

/// Status constants for ChannelState.
pub mod channel_status {
    pub const ACTIVE: u8 = 0;
    pub const CLOSED: u8 = 1;
}

/// Persistent financial state channel between a funder (agent) and recipient (service).
///
/// PDA seeds: [b"amp-channel", funder, recipient, nonce.to_le_bytes()]
///
/// See SPEC.md Section 4.2 for the full field specification.
#[account]
#[derive(Default)]
pub struct ChannelState {
    /// PDA bump seed
    pub bump: u8,
    /// Channel funder (payer / agent)
    pub funder: Pubkey,
    /// Channel recipient (service provider)
    pub recipient: Pubkey,
    /// SPL token mint (e.g. USDC)
    pub mint: Pubkey,
    /// Token account holding channel funds (PDA-owned vault)
    pub vault: Pubkey,
    /// Current available balance in token smallest unit
    pub balance: u64,
    /// Lifetime total deposits
    pub total_deposited: u64,
    /// Lifetime total settled (paid to recipient)
    pub total_consumed: u64,
    /// Maximum tokens that can be settled per settle_interval
    pub rate_limit: u64,
    /// Minimum seconds between settlements
    pub settle_interval: i64,
    /// Timestamp of last successful settlement
    pub last_settle_ts: i64,
    /// Channel nonce (allows multiple channels per funder-recipient pair)
    pub nonce: u64,
    /// Channel status: 0 = Active, 1 = Closed
    pub status: u8,
    /// Channel creation timestamp
    pub created_at: i64,

    // --- Delegation fields ---
    /// Optional delegate who can consume on behalf of funder
    pub delegate: Option<Pubkey>,
    /// Maximum amount delegate can consume (lifetime)
    pub delegate_limit: u64,
    /// Amount delegate has consumed so far
    pub delegate_consumed: u64,

    // --- Stratum fields ---
    /// Whether this channel opts into multilateral netting
    pub stratum_enabled: bool,
    /// Netting cycle interval in seconds
    pub stratum_cycle: i64,
    /// Stratum netting engine pubkey (authorized to call settle)
    pub stratum_authority: Option<Pubkey>,

    // --- Chaining fields ---
    /// Upstream channel PDA (None for root channels)
    pub parent_channel: Option<Pubkey>,
    /// Number of active downstream channels
    pub child_channels: u8,
    /// Maximum allowed chain depth
    pub max_chain_depth: u8,
    /// Current depth in the chain (0 = root)
    pub chain_depth: u8,
}
