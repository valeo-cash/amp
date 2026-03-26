use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::AmpError;
use crate::state::{channel_status, ChannelState};

#[derive(Accounts)]
pub struct Settle<'info> {
    /// Settlement authority — must be the channel recipient or stratum_authority.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// ChannelState PDA.
    #[account(
        mut,
        seeds = [CHANNEL_SEED, channel_state.funder.as_ref(), channel_state.recipient.as_ref(), &channel_state.nonce.to_le_bytes()],
        bump = channel_state.bump,
        constraint = channel_state.status == channel_status::ACTIVE @ AmpError::ChannelNotActive,
    )]
    pub channel_state: Box<Account<'info, ChannelState>>,

    /// Channel vault token account.
    #[account(
        mut,
        seeds = [CHANNEL_VAULT_SEED, channel_state.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Recipient's token account — destination for settled funds.
    #[account(
        mut,
        constraint = recipient_token_account.mint == channel_state.mint,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Settle>, amount: u64) -> Result<()> {
    let channel = &ctx.accounts.channel_state;

    // Verify authority is the recipient or the stratum_authority.
    let is_recipient = ctx.accounts.authority.key() == channel.recipient;
    let is_stratum = channel
        .stratum_authority
        .map(|sa| sa == ctx.accounts.authority.key())
        .unwrap_or(false);
    require!(is_recipient || is_stratum, AmpError::Unauthorized);

    require!(amount > 0, AmpError::ZeroAmount);
    require!(amount <= channel.balance, AmpError::InsufficientBalance);
    require!(amount <= channel.rate_limit, AmpError::RateLimitExceeded);

    let now = Clock::get()?.unix_timestamp;
    let earliest_settle = channel
        .last_settle_ts
        .checked_add(channel.settle_interval)
        .ok_or(AmpError::Overflow)?;
    require!(now >= earliest_settle, AmpError::SettleTooEarly);

    // Transfer from vault to recipient via PDA-signed CPI.
    let funder_key = channel.funder;
    let recipient_key = channel.recipient;
    let nonce_bytes = channel.nonce.to_le_bytes();
    let bump = channel.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        CHANNEL_SEED,
        funder_key.as_ref(),
        recipient_key.as_ref(),
        &nonce_bytes,
        &[bump],
    ]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.channel_state.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let channel = &mut ctx.accounts.channel_state;
    channel.balance = channel
        .balance
        .checked_sub(amount)
        .ok_or(AmpError::Overflow)?;
    channel.total_consumed = channel
        .total_consumed
        .checked_add(amount)
        .ok_or(AmpError::Overflow)?;
    channel.last_settle_ts = now;

    msg!(
        "AMP: settled | amount={} remaining_balance={}",
        amount,
        channel.balance
    );

    Ok(())
}
