import type { Credential } from "@tac/shared";
import { computeCredentialDigest, bufferToBase64url } from "@tac/shared";
import { GrantRecordStore } from "../models/grant-record-store.js";
import { RegisteredPasskeyStore } from "../models/registered-passkey-store.js";
import { verifyAssertion } from "./webauthn.js";

export type ActivationRejectionReason =
  | "nonce_not_found"
  | "nonce_expired"
  | "account_mismatch"
  | "invalid_signature"
  | "terms_mismatch"
  | "assurance_mismatch";

export type ActivationOutcome = { ok: true } | { ok: false; reason: ActivationRejectionReason };

/** Ceremony two's activation path. Every check below runs against state retrieved by a single
 * `retrieveForVerification()` call (FR-014, Principle V — NON-NEGOTIABLE): the nonce is
 * consumed at that moment, before ANY of the checks that follow run — so a failed check here
 * can never leave the nonce redeemable for a second attempt (FR-015, User Story 3 Scenario 2).
 * The `active` transition (bottom of `activate()`) is the ONLY state-mutating write in the
 * success path, and it only runs after every check has passed — no partial-state writes occur
 * on any failure branch (User Story 2, FR-011). */
export class CredentialValidationService {
  constructor(
    private readonly grantStore: GrantRecordStore,
    private readonly passkeyStore: RegisteredPasskeyStore,
  ) {}

  async activate(credential: Credential): Promise<ActivationOutcome> {
    const record = this.grantStore.retrieveForVerification(credential.integrity.grantNonce);
    if (!record) {
      return { ok: false, reason: "nonce_not_found" };
    }

    // FR-013: an elapsed nonce window rejects even a validly-signed credential, and the
    // record transitions to `expired`, not `active` (User Story 3, Scenario 3).
    if (new Date(record.nonceExpiresAt).getTime() < Date.now()) {
      this.grantStore.transitionToExpired(record.nonce);
      return { ok: false, reason: "nonce_expired" };
    }

    const registered = this.passkeyStore.getByAccountId(record.userPublicKeyRef);
    const storedJwk = this.passkeyStore.getPublicKeyJwkByAccountId(record.userPublicKeyRef);
    if (!registered || !storedJwk || !jwkKeysEqual(storedJwk, credential.identity.userPublicKey)) {
      return { ok: false, reason: "account_mismatch" };
    }

    if (
      !deepEqual(record.agreedScope, credential.scope) ||
      record.agreedDuration.validFrom !== credential.temporal.validFrom ||
      record.agreedDuration.validUntil !== credential.temporal.validUntil
    ) {
      return { ok: false, reason: "terms_mismatch" };
    }

    if (record.assuranceLevel !== credential.integrity.assuranceLevel) {
      return { ok: false, reason: "assurance_mismatch" };
    }

    const digest = await computeCredentialDigest({
      identity: credential.identity,
      scope: credential.scope,
      temporal: credential.temporal,
      assuranceLevel: credential.integrity.assuranceLevel,
      grantNonce: credential.integrity.grantNonce,
    });
    const expectedChallenge = bufferToBase64url(digest);

    let verify;
    try {
      verify = await verifyAssertion(credential.integrity.userSignature, expectedChallenge, registered);
    } catch {
      return { ok: false, reason: "invalid_signature" };
    }
    if (!verify.verified) {
      return { ok: false, reason: "invalid_signature" };
    }

    this.passkeyStore.updateCounter(registered.credentialID, verify.newCounter);
    this.grantStore.transitionToActive(record.nonce);
    return { ok: true };
  }
}

function jwkKeysEqual(a: JsonWebKey, b: JsonWebKey): boolean {
  return a.kty === b.kty && a.x === b.x && a.y === b.y && a.crv === b.crv;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
