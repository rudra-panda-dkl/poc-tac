import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { GrantRecordStore } from "../models/grant-record-store.js";
import { RegisteredPasskeyStore } from "../models/registered-passkey-store.js";
import { RevocationChallengeStore } from "../models/revocation-challenge-store.js";
import { buildAuthenticationOptions, verifyAssertion } from "./webauthn.js";

const CHALLENGE_WINDOW_SECONDS_DEFAULT = 60; // spec.md Assumptions: short-lived by design, mirrors 002-transact's challenge window

export interface RevokeRequest {
  grantNonce: string;
}

export interface RevokeRequestSuccess {
  challengeId: string;
  options: PublicKeyCredentialRequestOptionsJSON;
}

export type RevokeGateRejectionReason = "grant_not_active";

export type RevokeRequestOutcome =
  | { ok: true; result: RevokeRequestSuccess }
  | { ok: false; reason: RevokeGateRejectionReason };

export interface RevokeRespondRequest {
  challengeId: string;
  assertionResponse: AuthenticationResponseJSON;
}

export type RevokeRespondRejectionReason =
  | "challenge_not_found"
  | "challenge_expired"
  | "grant_not_active"
  | "invalid_signature";

export type RevokeRespondOutcome =
  | { ok: true; grantNonce: string }
  | { ok: false; reason: RevokeRespondRejectionReason };

/** Implements FR-001 through FR-012: the revocation challenge-response flow. The Grant-state
 * gate (FR-002) gates challenge issuance (FR-003) in `request()`, scoped to the Grant owner's
 * own registered credential (`allowCredentials`, specs/003-revoke/research.md §2); the challenge
 * is retrieved-and-consumed at the START of `respond()` (FR-007, Constitution Principle V —
 * NON-NEGOTIABLE), before the Grant state is re-checked and the signature is verified against
 * the passkey registered for `challenge.grantNonce`'s owner — never a value resent by the caller
 * (FR-005/FR-006). No field in either request lets the caller assert which Grant it targets
 * beyond the RP's own stored challenge→grantNonce binding. */
export class RevocationService {
  constructor(
    private readonly grantStore: GrantRecordStore,
    private readonly passkeyStore: RegisteredPasskeyStore,
    private readonly challengeStore: RevocationChallengeStore,
    private readonly challengeWindowSeconds: number = CHALLENGE_WINDOW_SECONDS_DEFAULT,
  ) {}

  /** FR-001/FR-002/FR-003: the Grant-state gate. Any failure denies with NO challenge issued
   * (SC-003) — an unknown/bogus `grantNonce` is denied identically to a `pending`, `expired`, or
   * already-`revoked` Grant, per spec.md Edge Cases. */
  async request(req: RevokeRequest): Promise<RevokeRequestOutcome> {
    const gateFailure = this.evaluateActive(req.grantNonce);
    if (gateFailure) {
      return { ok: false, reason: gateFailure };
    }

    const record = this.grantStore.get(req.grantNonce)!;
    const authenticator = this.passkeyStore.getByAccountId(record.userPublicKeyRef);
    const options = await buildAuthenticationOptions(authenticator?.credentialID);

    const challengeId = crypto.randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.challengeWindowSeconds * 1000);

    this.challengeStore.issue({
      challengeId,
      challenge: options.challenge,
      grantNonce: req.grantNonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      consumedAt: null,
    });

    return { ok: true, result: { challengeId, options } };
  }

  /** FR-005/FR-007/FR-008/FR-010/FR-011: the challenge-response verification and revocation
   * decision. `retrieveForVerification()` runs FIRST — before the Grant-state re-check or
   * signature verification — so a second presentation of the same `challengeId` is always
   * rejected regardless of what happened on the first attempt (FR-008). */
  async respond(req: RevokeRespondRequest): Promise<RevokeRespondOutcome> {
    const challenge = this.challengeStore.retrieveForVerification(req.challengeId);
    if (!challenge) {
      return { ok: false, reason: "challenge_not_found" };
    }

    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
      return { ok: false, reason: "challenge_expired" };
    }

    // Mirrors 002-transact's respond-time re-check (research.md §5 there): the target Grant
    // could in principle have left `active` for an unrelated reason between request and respond.
    const gateFailure = this.evaluateActive(challenge.grantNonce);
    if (gateFailure) {
      return { ok: false, reason: gateFailure };
    }

    const record = this.grantStore.get(challenge.grantNonce)!;
    const authenticator = this.passkeyStore.getByAccountId(record.userPublicKeyRef);
    if (!authenticator) {
      return { ok: false, reason: "invalid_signature" };
    }

    let verify;
    try {
      verify = await verifyAssertion(req.assertionResponse, challenge.challenge, authenticator);
    } catch {
      return { ok: false, reason: "invalid_signature" };
    }
    if (!verify.verified) {
      return { ok: false, reason: "invalid_signature" };
    }

    this.passkeyStore.updateCounter(authenticator.credentialID, verify.newCounter);
    this.grantStore.transitionToRevoked(challenge.grantNonce);

    return { ok: true, grantNonce: challenge.grantNonce };
  }

  private evaluateActive(grantNonce: string): "grant_not_active" | undefined {
    const record = this.grantStore.get(grantNonce);
    if (!record || record.status !== "active") {
      return "grant_not_active";
    }
    return undefined;
  }
}
