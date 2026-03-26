use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::AmpError;
use crate::state::{channel_status, ChannelState};

#[derive(Accounts)]
#[instruction(deposit: u64, rate_limit: u64, settle_interval: i64, nonce: u64)]
pub struct OpenChannel<'info> {
    /// Channel funder — pays for account creation and deposits funds.
    #[account(mut)]
    pub funder: Signer<'info>,

    /// Channel recipient (service provider). Not a signer.
    /// CHECK: Any valid pubkey can be a recipient.
    pub recipient: UncheckedAccount<'info>,

    /// SPL token mint for this channel.
    pub mint: Account<'info, Mint>,

    /// ChannelState PDA — initialized by this instruction.
    #[account(
        init,
        payer = funder,
        space = CHANNEL_STATE_SIZE,
        seeds = [CHANNEL_SEED, funder.key().as_ref(), recipient.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub channel_state: Box<Account<'info, ChannelState>>,

    /// Vault token account — PDA-owned, holds deposited tokens.
    #[account(
        init,
        payer = funder,
        token::mint = mint,
        token::authority = channel_state,
        seeds = [CHANNEL_VAULT_SEED, channel_state.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Funder's token account — source of the deposit.
    #[account(
        mut,
        constraint = funder_token_account.owner == funder.key(),
        constraint = funder_token_account.mint == mint.key(),
    )]
    pub funder_token_account: Box<Account<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<OpenChannel>,
    deposit: u64,
    rate_limit: u64,
    settle_interval: i64,
    nonce: u64,
) -> Result<()> {
    require!(deposit > 0, AmpError::ZeroAmount);
    require!(rate_limit > 0, AmpError::InvalidRateLimit);
    require!(
        settle_interval >= MIN_SETTLE_INTERVAL && settle_interval <= MAX_SETTLE_INTERVAL,
        AmpError::InvalidSettleInterval
    );

    let now = Clock::get()?.unix_timestamp;

    let channel = &mut ctx.accounts.channel_state;
    channel.bump = ctx.bumps.channel_state;
    channel.funder = ctx.accounts.funder.key();
    channel.recipient = ctx.accounts.recipient.key();
    channel.mint = ctx.accounts.mint.key();
    channel.vault = ctx.accounts.vault.key();
    channel.balance = deposit;
    channel.total_deposited = deposit;
    channel.total_consumed = 0;
    channel.rate_limit = rate_limit;
    channel.settle_interval = settle_interval;
    channel.last_settle_ts = now;
    channel.nonce = nonce;
    channel.status = channel_status::ACTIVE;
    channel.created_at = now;
    channel.delegate = None;
    channel.delegate_limit = 0;
    channel.delegate_consumed = 0;
    channel.stratum_enabled = false;
    channel.stratum_cycle = 0;
    channel.stratum_authority = None;
    channel.parent_channel = None;
    channel.child_channels = 0;
    channel.max_chain_depth = MAX_CHAIN_DEPTH;
    channel.chain_depth = 0;

    // Transfer deposit from funder's token account to the vault.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.funder_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        deposit,
    )?;

    msg!(
        "AMP: channel opened | funder={} recipient={} deposit={} nonce={}",
        channel.funder,
        channel.recipient,
        deposit,
        nonce
    );

    Ok(())
}
