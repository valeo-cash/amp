use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("2KQCaQ9j8YtewZ4QjmDfnsVANZXLBcPSYFhAj2eUNaPP");

#[program]
pub mod amp_channel {
    use super::*;

    pub fn open_channel(
        ctx: Context<OpenChannel>,
        deposit: u64,
        rate_limit: u64,
        settle_interval: i64,
        nonce: u64,
    ) -> Result<()> {
        instructions::open_channel::handler(ctx, deposit, rate_limit, settle_interval, nonce)
    }

    pub fn top_up(ctx: Context<TopUp>, amount: u64) -> Result<()> {
        instructions::top_up::handler(ctx, amount)
    }

    pub fn settle(ctx: Context<Settle>, amount: u64) -> Result<()> {
        instructions::settle::handler(ctx, amount)
    }

    pub fn close_channel(
        ctx: Context<CloseChannel>,
        final_settle_amount: u64,
    ) -> Result<()> {
        instructions::close_channel::handler(ctx, final_settle_amount)
    }

    pub fn set_delegate(
        ctx: Context<SetDelegate>,
        delegate_pubkey: Pubkey,
        limit: u64,
    ) -> Result<()> {
        instructions::delegate::handler(ctx, delegate_pubkey, limit)
    }

    pub fn chain_channel(
        ctx: Context<ChainChannel>,
        amount: u64,
        rate_limit: u64,
        settle_interval: i64,
        nonce: u64,
    ) -> Result<()> {
        instructions::chain_channel::handler(ctx, amount, rate_limit, settle_interval, nonce)
    }
}
