import type { AssuranceLevel, CredentialScope } from "./credential.js";

/** Handoff contract for 002-transact (reads agreedScope/agreedDuration/status) and 003-revoke
 * (adds a `revoked` status reachable from `active`) — see specs/001-grant/data-model.md.
 * `revoked` is 003-revoke's addition (FR-010, specs/003-revoke/data-model.md) — terminal,
 * reachable only from `active`. */
export type GrantRecordStatus = "pending" | "active" | "expired" | "revoked";

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
