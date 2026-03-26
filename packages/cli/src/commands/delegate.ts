import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import ora from "ora";
import { loadWallet } from "../utils/wallet";
import { getProgram } from "../utils/connection";
import { header, kvLine, success, cyan, green, trunc, usdcAmount } from "../utils/display";

export function registerDelegateCommands(program: Command): void {
  program
    .command("delegate <channel> <pubkey> <amount>")
    .description("Delegate budget to a sub-agent")
    .action(async (channelAddr: string, pubkey: string, amount: string) => {
      const kp = loadWallet();
      const prog = getProgram(kp);
      const pda = new PublicKey(channelAddr);
      const delegatePk = new PublicKey(pubkey);
      const limit = Math.round(parseFloat(amount) * 1_000_000);

      const spinner = ora("Setting delegation...").start();
      await (prog.methods as any)
        .setDelegate(delegatePk, new BN(limit))
        .accounts({ funder: kp.publicKey, channelState: pda })
        .signers([kp]).rpc();
      spinner.stop();

      header("Delegation Set");
      kvLine("Channel:", trunc(channelAddr));
      kvLine("Delegate:", trunc(pubkey));
      kvLine("Limit:", green(usdcAmount(limit) + " USDC"));
      console.log();
    });

  program
    .command("delegate-revoke <channel>")
    .description("Revoke delegation on a channel")
    .action(async (channelAddr: string) => {
      const kp = loadWallet();
      const prog = getProgram(kp);
      const pda = new PublicKey(channelAddr);
      const zeroPk = PublicKey.default;

      const spinner = ora("Revoking delegation...").start();
      await (prog.methods as any)
        .setDelegate(zeroPk, new BN(0))
        .accounts({ funder: kp.publicKey, channelState: pda })
        .signers([kp]).rpc();
      spinner.stop();
      success("Delegation revoked on " + cyan(trunc(channelAddr)));
      console.log();
    });
}
