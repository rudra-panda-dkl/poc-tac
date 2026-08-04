import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const canonicalize = require("canonicalize") as (input: unknown) => string | undefined;

/** What the Agent signs and the RP reconstructs to verify (FR-007) — see
 * specs/002-transact/data-model.md "Entity: Transaction Signature Payload". Not persisted. */
export interface TransactionSignaturePayload {
  challenge: string;
  txType: string;
  amount: number;
}

/** Single source of truth for the transaction-time challenge-response signed payload, used
 * identically by agent-client (signing side) and rp-server (verification side) — same rationale
 * as 001-grant's `computeCredentialDigest()` in canonicalize.ts. JCS-canonicalizes exactly
 * `{challenge, txType, amount}` (FR-007, resolves research.md §2) and returns UTF-8 bytes ready
 * for ECDSA sign/verify directly — unlike the credential digest, no separate pre-hash step is
 * needed here, since WebCrypto's ECDSA sign/verify hashes internally when given a `hash`
 * parameter. */
export function computeTransactionSignatureBytes(payload: TransactionSignaturePayload): Uint8Array<ArrayBuffer> {
  const canonicalJson = canonicalize(payload);
  if (canonicalJson === undefined) {
    throw new Error("Transaction signature payload could not be JCS-canonicalized (contains undefined?)");
  }
  return new TextEncoder().encode(canonicalJson);
}
