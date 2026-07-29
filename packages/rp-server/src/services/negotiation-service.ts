import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import type { AssuranceLevel, CredentialScope } from "@tac/shared";
import { RegisteredPasskeyStore } from "../models/registered-passkey-store.js";
import { GrantRecordStore } from "../models/grant-record-store.js";
import { AssuranceCeilingPolicy } from "../models/assurance-ceiling-policy.js";
import { verifyAssertion, deriveAssuranceLevel } from "./webauthn.js";

const NONCE_WINDOW_SECONDS_DEFAULT = 5 * 60; // FR-012, resolves OQ-5

export interface NegotiateRequest {
  accountId: string;
  assertionResponse: AuthenticationResponseJSON;
  expectedChallenge: string;
  requestedScope: CredentialScope;
  requestedDuration: { validFrom: string; validUntil: string };
}

export interface NegotiateSuccess {
  nonce: string;
  agreedScope: CredentialScope;
  agreedDuration: { validFrom: string; validUntil: string };
  assuranceLevel: AssuranceLevel;
  rpIdentifier: string;
  nonceExpiresAt: string;
}

export type NegotiateOutcome =
  | { ok: true; result: NegotiateSuccess }
  | { ok: false; reason: "invalid_assertion" | "account_not_found" | "exceeds_ceiling" };

/** Ceremony one: verify authentication, derive assurance level, negotiate scope/duration
 * bounded by the ceiling policy (FR-006/FR-007/FR-007a), and persist a `pending` Grant Record
 * (FR-010) with a nonce window that defaults to 5 minutes and is always validated as strictly
 * shorter than the negotiated credential's validity window (FR-012). */
export class NegotiationService {
  constructor(
    private readonly passkeyStore: RegisteredPasskeyStore,
    private readonly grantStore: GrantRecordStore,
    private readonly ceilingPolicy: AssuranceCeilingPolicy,
    private readonly rpIdentifier: string,
    private readonly nonceWindowSeconds: number = NONCE_WINDOW_SECONDS_DEFAULT,
  ) {}

  async negotiate(request: NegotiateRequest): Promise<NegotiateOutcome> {
    const authenticator = this.passkeyStore.getByAccountId(request.accountId);
    if (!authenticator) {
      return { ok: false, reason: "account_not_found" };
    }

    let verify;
    try {
      verify = await verifyAssertion(
        request.assertionResponse,
        request.expectedChallenge,
        authenticator,
      );
    } catch {
      return { ok: false, reason: "invalid_assertion" };
    }
    if (!verify.verified) {
      return { ok: false, reason: "invalid_assertion" };
    }
    this.passkeyStore.updateCounter(authenticator.credentialID, verify.newCounter);

    const assuranceLevel = deriveAssuranceLevel(verify.userVerified);

    const requestedDurationSeconds =
      (new Date(request.requestedDuration.validUntil).getTime() -
        new Date(request.requestedDuration.validFrom).getTime()) /
      1000;
    if (!this.ceilingPolicy.isWithinCeiling(assuranceLevel, requestedDurationSeconds)) {
      return { ok: false, reason: "exceeds_ceiling" };
    }

    // FR-012: the nonce window MUST be strictly shorter than the credential's own validity
    // window. The 5-minute default satisfies this for any reasonably-lived grant; for the
    // edge case of a requested duration shorter than the default itself, shrink the window
    // rather than silently violate the constraint.
    const nonceIssuedAt = new Date();
    let nonceWindowSeconds = this.nonceWindowSeconds;
    if (nonceWindowSeconds >= requestedDurationSeconds) {
      nonceWindowSeconds = Math.max(1, Math.floor(requestedDurationSeconds / 2));
    }
    const nonceExpiresAt = new Date(nonceIssuedAt.getTime() + nonceWindowSeconds * 1000);

    const nonce = crypto.randomUUID();
    this.grantStore.createPending({
      nonce,
      userPublicKeyRef: request.accountId,
      agreedScope: request.requestedScope,
      agreedDuration: request.requestedDuration,
      assuranceLevel,
      nonceIssuedAt: nonceIssuedAt.toISOString(),
      nonceExpiresAt: nonceExpiresAt.toISOString(),
      status: "pending",
      consumedAt: null,
    });

    return {
      ok: true,
      result: {
        nonce,
        agreedScope: request.requestedScope,
        agreedDuration: request.requestedDuration,
        assuranceLevel,
        rpIdentifier: this.rpIdentifier,
        nonceExpiresAt: nonceExpiresAt.toISOString(),
      },
    };
  }
}
