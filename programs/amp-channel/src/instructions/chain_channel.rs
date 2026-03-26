use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::AmpError;
use crate::state::{channel_status, ChannelState};

#[derive(Accounts)]
#[instruction(amount: u64, rate_limit: u64, settle_interval: i64, nonce: u64)]
pub struct ChainChannel<'info> {
    /// Upstream channel recipient — only they can create downstream channels.
    #[account(mut)]
    pub upstream_recipient: Signer<'info>,

    /// Upstream ChannelState PDA.
    #[account(
        mut,
        seeds = [CHANNEL_SEED, upstream_channel.funder.as_ref(), upstream_channel.recipient.as_ref(), &upstream_channel.nonce.to_le_bytes()],
        bump = upstream_channel.bump,
        constraint = upstream_channel.status == channel_status::ACTIVE @ AmpError::ChannelNotActive,
        constraint = upstream_channel.recipient == upstream_recipient.key() @ AmpError::NotUpstreamRecipient,
    )]
    pub upstream_channel: Box<Account<'info, ChannelState>>,

    /// Upstream vault token account — validated as the vault stored in upstream_channel.
    #[account(
        mut,
        constraint = upstream_vault.key() == upstream_channel.vault @ AmpError::Unauthorized,
    )]
    pub upstream_vault: Box<Account<'info, TokenAccount>>,

    /// Downstream channel recipient (the sub-service).
    /// CHECK: Any valid pubkey can be a downstream recipient.
    pub downstream_recipient: AccountInfo<'info>,

    /// SPL token mint — validated in handler against upstream channel's mint.
    pub mint: Box<Account<'info, Mint>>,

    /// Downstream ChannelState PDA — initialized by this instruction.
    /// The upstream_recipient becomes the funder of the downstream channel.
    #[account(
        init,
        payer = upstream_recipient,
        space = CHANNEL_STATE_SIZE,
        seeds = [CHANNEL_SEED, upstream_recipient.key().as_ref(), downstream_recipient.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub downstream_channel: Box<Account<'info, ChannelState>>,

    /// Downstream vault token account.
    #[account(
        init,
        payer = upstream_recipient,
        token::mint = mint,
        token::authority = downstream_channel,
        seeds = [CHANNEL_VAULT_SEED, downstream_channel.key().as_ref()],
        bump,
    )]
    pub downstream_vault: Box<Account<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<ChainChannel>,
    amount: u64,
    rate_limit: u64,
    settle_interval: i64,
    nonce: u64,
) -> Result<()> {
    require!(amount > 0, AmpError::ZeroAmount);
    require!(rate_limit > 0, AmpError::InvalidRateLimit);
    require!(
        ctx.accounts.mint.key() == ctx.accounts.upstream_channel.mint,
        AmpError::Unauthorized
    );
    require!(
        settle_interval >= MIN_SETTLE_INTERVAL && settle_interval <= MAX_SETTLE_INTERVAL,
        AmpError::InvalidSettleInterval
    );

    let upstream = &ctx.accounts.upstream_channel;
    require!(
        amount <= upstream.balance,
        AmpError::ChainAmountExceedsBalance
    );
    require!(
        upstream.chain_depth < upstream.max_chain_depth,
        AmpError::MaxChainDepthExceeded
    );

    // Transfer from upstream vault to downstream vault via PDA-signed CPI.
    let funder_key = upstream.funder;
    let recipient_key = upstream.recipient;
    let upstream_nonce_bytes = upstream.nonce.to_le_bytes();
    let upstream_bump = upstream.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        CHANNEL_SEED,
        funder_key.as_ref(),
        recipient_key.as_ref(),
        &upstream_nonce_bytes,
        &[upstream_bump],
    ]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.upstream_vault.to_account_info(),
                to: ctx.accounts.downstream_vault.to_account_info(),
                authority: ctx.accounts.upstream_channel.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Capture values from upstream before mutable borrow.
    let upstream_key = ctx.accounts.upstream_channel.key();
    let upstream_max_chain_depth = ctx.accounts.upstream_channel.max_chain_depth;
    let upstream_chain_depth = ctx.accounts.upstream_channel.chain_depth;

    // Update upstream channel state.
    let upstream = &mut ctx.accounts.upstream_channel;
    upstream.balance = upstream
        .balance
        .checked_sub(amount)
        .ok_or(AmpError::Overflow)?;
    upstream.child_channels = upstream
        .child_channels
        .checked_add(1)
        .ok_or(AmpError::Overflow)?;

    // Initialize downstream channel.
    let now = Clock::get()?.unix_timestamp;
    let downstream = &mut ctx.accounts.downstream_channel;
    downstream.bump = ctx.bumps.downstream_channel;
    downstream.funder = ctx.accounts.upstream_recipient.key();
    downstream.recipient = ctx.accounts.downstream_recipient.key();
    downstream.mint = ctx.accounts.mint.key();
    downstream.vault = ctx.accounts.downstream_vault.key();
    downstream.balance = amount;
    downstream.total_deposited = amount;
    downstream.total_consumed = 0;
    downstream.rate_limit = rate_limit;
    downstream.settle_interval = settle_interval;
    downstream.last_settle_ts = now;
    downstream.nonce = nonce;
    downstream.status = channel_status::ACTIVE;
    downstream.created_at = now;
    downstream.delegate = None;
    downstream.delegate_limit = 0;
    downstream.delegate_consumed = 0;
    downstream.stratum_enabled = false;
    downstream.stratum_cycle = 0;
    downstream.stratum_authority = None;
    downstream.parent_channel = Some(upstream_key);
    downstream.child_channels = 0;
    downstream.max_chain_depth = upstream_max_chain_depth;
    downstream.chain_depth = upstream_chain_depth
        .checked_add(1)
        .ok_or(AmpError::Overflow)?;

    msg!(
        "AMP: chain created | upstream={} downstream={} amount={}",
        upstream_key,
        ctx.accounts.downstream_channel.key(),
        amount
    );

    Ok(())
}
