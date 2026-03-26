use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::AmpError;
use crate::state::{channel_status, ChannelState};

#[derive(Accounts)]
pub struct CloseChannel<'info> {
    /// Closer — must be the funder or the recipient.
    pub closer: Signer<'info>,

    /// Channel funder — receives remaining balance and rent.
    /// CHECK: Validated against channel_state.funder.
    #[account(mut)]
    pub funder: UncheckedAccount<'info>,

    /// Channel recipient.
    /// CHECK: Validated against channel_state.recipient.
    pub recipient: UncheckedAccount<'info>,

    /// ChannelState PDA — closed after this instruction (rent to funder).
    #[account(
        mut,
        seeds = [CHANNEL_SEED, channel_state.funder.as_ref(), channel_state.recipient.as_ref(), &channel_state.nonce.to_le_bytes()],
        bump = channel_state.bump,
        constraint = channel_state.status == channel_status::ACTIVE @ AmpError::ChannelNotActive,
        constraint = channel_state.child_channels == 0 @ AmpError::HasActiveChildren,
        constraint = funder.key() == channel_state.funder @ AmpError::Unauthorized,
        constraint = recipient.key() == channel_state.recipient @ AmpError::Unauthorized,
        close = funder,
    )]
    pub channel_state: Box<Account<'info, ChannelState>>,

    /// Channel vault token account.
    #[account(
        mut,
        seeds = [CHANNEL_VAULT_SEED, channel_state.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Funder's token account — receives remaining balance.
    #[account(
        mut,
        constraint = funder_token_account.mint == channel_state.mint,
    )]
    pub funder_token_account: Account<'info, TokenAccount>,

    /// Recipient's token account — receives final settlement.
    #[account(
        mut,
        constraint = recipient_token_account.mint == channel_state.mint,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    /// Optional parent ChannelState for chained channels.
    /// Must be provided if channel_state.parent_channel is Some.
    /// CHECK: Validated in handler against channel_state.parent_channel.
    #[account(mut)]
    pub parent_channel_state: Option<Account<'info, ChannelState>>,
}

pub fn handler(ctx: Context<CloseChannel>, final_settle_amount: u64) -> Result<()> {
    let channel = &ctx.accounts.channel_state;

    // Closer must be funder or recipient.
    require!(
        ctx.accounts.closer.key() == channel.funder
            || ctx.accounts.closer.key() == channel.recipient,
        AmpError::Unauthorized
    );

    require!(
        final_settle_amount <= channel.balance,
        AmpError::InsufficientBalance
    );

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

    // Final settlement to recipient if any amount owed.
    if final_settle_amount > 0 {
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
            final_settle_amount,
        )?;
    }

    // Transfer remaining balance to funder.
    let remaining = ctx.accounts.channel_state.balance
        .checked_sub(final_settle_amount)
        .ok_or(AmpError::Overflow)?;

    if remaining > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.funder_token_account.to_account_info(),
                    authority: ctx.accounts.channel_state.to_account_info(),
                },
                signer_seeds,
            ),
            remaining,
        )?;
    }

    // Close the vault token account — SOL rent goes to funder.
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.funder.to_account_info(),
            authority: ctx.accounts.channel_state.to_account_info(),
        },
        signer_seeds,
    ))?;

    // Decrement parent's child_channels if this is a chained channel.
    if ctx.accounts.channel_state.parent_channel.is_some() {
        let parent = ctx.accounts.parent_channel_state.as_mut()
            .ok_or(AmpError::Unauthorized)?;
        require!(
            parent.key() == ctx.accounts.channel_state.parent_channel.unwrap(),
            AmpError::Unauthorized
        );
        parent.child_channels = parent
            .child_channels
            .checked_sub(1)
            .ok_or(AmpError::Overflow)?;
    }

    // Mark channel as closed. Account will be closed by Anchor's `close` constraint.
    // Note: We set status but the account data will be zeroed by Anchor anyway.
    // The close = funder constraint was removed since we need to set status first.

    msg!(
        "AMP: channel closed | final_settle={} refund={}",
        final_settle_amount,
        remaining
    );

    Ok(())
}
