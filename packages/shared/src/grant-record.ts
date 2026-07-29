import type { AssuranceLevel, CredentialScope } from "./credential.js";

/** Handoff contract for 002-transact (reads agreedScope/agreedDuration/status) and 003-revoke
 * (adds a `revoked` status reachable from `active`) — see specs/001-grant/data-model.md. */
export type GrantRecordStatus = "pending" | "active" | "expired";

export interface GrantRecord {
  nonce: string;
  userPublicKeyRef: string;
  agreedScope: CredentialScope;
  agreedDuration: {
    validFrom: string;
    validUntil: string;
  };
  assuranceLevel: AssuranceLevel;
  nonceIssuedAt: string;
  nonceExpiresAt: string;
  status: GrantRecordStatus;
  /** Set the instant the nonce is retrieved for verification (FR-014), before any other
   * check — independent of `status`, `consumedAt !== null` means "not redeemable again." */
  consumedAt: string | null;
}
