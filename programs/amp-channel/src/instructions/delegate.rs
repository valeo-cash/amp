use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::AmpError;
use crate::state::{channel_status, ChannelState};

#[derive(Accounts)]
pub struct SetDelegate<'info> {
    /// Channel funder — only the funder can set a delegate.
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
}

pub fn handler(ctx: Context<SetDelegate>, delegate_pubkey: Pubkey, limit: u64) -> Result<()> {
    let channel = &mut ctx.accounts.channel_state;

    require!(limit <= channel.balance, AmpError::DelegateLimitExceeded);

    channel.delegate = Some(delegate_pubkey);
    channel.delegate_limit = limit;
    channel.delegate_consumed = 0;

    msg!(
        "AMP: delegate set | delegate={} limit={}",
        delegate_pubkey,
        limit
    );

    Ok(())
}
