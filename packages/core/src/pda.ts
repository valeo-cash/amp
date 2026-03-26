import { PublicKey } from "@solana/web3.js";
import { AMP_PROGRAM_ID, CHANNEL_SEED, VAULT_SEED } from "./constants";

/**
 * Derive the ChannelState PDA address.
 * Seeds: [b"amp-channel", funder, recipient, nonce_le_bytes]
 */
export function deriveChannelPDA(
  funder: PublicKey,
  recipient: PublicKey,
  nonce: number | bigint,
  programId: PublicKey = AMP_PROGRAM_ID
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));

  return PublicKey.findProgramAddressSync(
    [CHANNEL_SEED, funder.toBuffer(), recipient.toBuffer(), nonceBuf],
    programId
  );
}

/**
 * Derive the channel vault PDA address.
 * Seeds: [b"amp-vault", channel_state_pda]
 */
export function deriveVaultPDA(
  channelState: PublicKey,
  programId: PublicKey = AMP_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, channelState.toBuffer()],
    programId
  );
}
