import type { AuthenticationResponseJSON } from "@simplewebauthn/types";

/** Handoff contract for 002-transact and 003-revoke — see specs/001-grant/data-model.md. */
export interface CredentialIdentity {
  userPublicKey: JsonWebKey;
  agentPublicKey: JsonWebKey;
  rpIdentifier: string;
}

/** Opaque to this feature — 002-transact defines what "in-scope" means (FR-020). */
export type CredentialScope = Record<string, unknown>;

export interface CredentialTemporal {
  validFrom: string;
  validUntil: string;
}

export type AssuranceLevel = "UP" | "UP+UV";

export interface CredentialIntegrity {
  grantNonce: string;
  assuranceLevel: AssuranceLevel;
  /** The full WebAuthn assertion response from ceremony two (FR-005), not just a bare
   * signature scalar — verifying it requires `authenticatorData` and `clientDataJSON`
   * alongside `signature`. Its `response.clientDataJSON.challenge` is the base64url JCS
   * digest (FR-021); the signature covers `authenticatorData || SHA-256(clientDataJSON)` and
   * is verified against the same registered authenticator ceremony one used. (Refined from an
   * earlier bare-signature-string sketch in data-model.md once implementation surfaced that
   * @simplewebauthn/server's verifier needs the full response shape.) */
  userSignature: AuthenticationResponseJSON;
}

export interface Credential {
  identity: CredentialIdentity;
  scope: CredentialScope;
  temporal: CredentialTemporal;
  integrity: CredentialIntegrity;
}

/** The subset of a Credential that is JCS-canonicalized and hashed into the ceremony-two
 * WebAuthn challenge (FR-021, resolves OQ-6) — every field except `integrity.userSignature`
 * itself, which cannot cover its own value. */
export type CanonicalDigestInput = {
  identity: CredentialIdentity;
  scope: CredentialScope;
  temporal: CredentialTemporal;
  assuranceLevel: AssuranceLevel;
  grantNonce: string;
};

/** What agent-client's Credential assembly (FR-019) can produce before ceremony two happens —
 * everything except `integrity.userSignature`, which only the User's WebAuthn ceremony can
 * supply. user-client fills in `userSignature` to produce a complete `Credential`. */
export type UnsignedCredential = {
  identity: CredentialIdentity;
  scope: CredentialScope;
  temporal: CredentialTemporal;
  integrity: Omit<CredentialIntegrity, "userSignature">;
};
