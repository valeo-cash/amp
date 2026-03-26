import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { Meter } from "./meter";
/**
 * Auto-settlement engine.
 * Periodically settles channels that have accumulated usage
 * by submitting the `settle` instruction to the AMP program.
 */
export declare class Settler {
    private connection;
    private program;
    private wallet;
    private meter;
    private intervalSeconds;
    private timer;
    private settling;
    constructor(connection: Connection, program: Program, wallet: Keypair, meter: Meter, intervalSeconds: number);
    /** Start the auto-settlement loop. */
    start(): void;
    /** Stop the auto-settlement loop. */
    stop(): void;
    /** Manually settle a specific channel. Returns the transaction signature. */
    settleChannel(channelPDA: PublicKey): Promise<string>;
    /** Settle all channels with accumulated usage. */
    settleAll(): Promise<Map<string, string>>;
}
//# sourceMappingURL=settler.d.ts.map