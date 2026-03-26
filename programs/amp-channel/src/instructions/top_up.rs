use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::AmpError;
use crate::state::{channel_status, ChannelState};

#[derive(Accounts)]
pub struct TopUp<'info> {
    /// Channel funder — must match channel_state.funder.
    #[account(mut)]
    pub funder: Signer<'info>,

    /// ChannelState PDA.
    #[account(
        mut,
        seeds = [CHANNEL_SEED, channel_state.funder.as_ref(), channel_state.recipient.as_ref(), &channel_state.nonce.to_le_bytes()],
        bump = channel_state.bump,
        constraint = channel_state.status == channel_status::ACTIVE @ AmpError::ChannelNotActive,
        constraint = channel_state.funder == funder.key() @ AmpError::Unauthorized,
    )]
    pub channel_state: Box<Account<'info, ChannelState>>,

    /// Channel vault token account.
    #[account(
        mut,
        seeds = [CHANNEL_VAULT_SEED, channel_state.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Funder's token account — source of the top-up.
    #[account(
        mut,
        constraint = funder_token_account.owner == funder.key(),
        constraint = funder_token_account.mint == channel_state.mint,
    )]
    pub funder_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<TopUp>, amount: u64) -> Result<()> {
    require!(amount > 0, AmpError::ZeroAmount);

    let channel = &mut ctx.accounts.channel_state;

    channel.balance = channel
        .balance
        .checked_add(amount)
        .ok_or(AmpError::Overflow)?;
    channel.total_deposited = channel
        .total_deposited
        .checked_add(amount)
        .ok_or(AmpError::Overflow)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.funder_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        amount,
    )?;

    msg!("AMP: top-up | amount={} new_balance={}", amount, channel.balance);

    Ok(())
}
