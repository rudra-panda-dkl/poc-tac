import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorDevice,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";

export const RP_ID = process.env.TAC_RP_ID ?? "localhost";
// Matches the software-authenticator demo signer's default origin (`http://${rpId}`) — a real
// browser-served UI would instead set this (and TAC_RP_ORIGIN) to that page's actual origin.
export const RP_ORIGIN = process.env.TAC_RP_ORIGIN ?? "http://localhost";

/** Ceremony one: server-issued challenge (FR-003). Thin wrapper so callers don't reach into
 * @simplewebauthn/server directly — keeps the RP_ID/RP_ORIGIN config in one place. */
export async function buildAuthenticationOptions(
  allowedCredentialId?: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    allowCredentials: allowedCredentialId
      ? [{ id: allowedCredentialId }]
      : undefined,
  });
}

export interface VerifyResult {
  verified: boolean;
  userVerified: boolean;
  newCounter: number;
}

/** Verifies a WebAuthn authentication (assertion) response against the RP's stored
 * registration record for the claimed account — used for BOTH ceremony one (FR-006: assurance
 * level is derived from this verification's UP/UV signals, server-issued challenge) and
 * ceremony two (FR-021: challenge is the JCS digest instead). Both are standard
 * `navigator.credentials.get()` assertions (FR-005) — only what's used as `challenge` differs. */
export async function verifyAssertion(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  authenticator: AuthenticatorDevice,
): Promise<VerifyResult> {
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: RP_ORIGIN,
    expectedRPID: RP_ID,
    authenticator,
    requireUserVerification: false,
  });
  return {
    verified: result.verified,
    userVerified: result.authenticationInfo.userVerified,
    newCounter: result.authenticationInfo.newCounter,
  };
}

/** FR-006: the assurance level is derived from ceremony one's UP/UV signals. A verified
 * assertion always implies User Presence; User Verification is a strictly stronger signal. */
export function deriveAssuranceLevel(userVerified: boolean): "UP" | "UP+UV" {
  return userVerified ? "UP+UV" : "UP";
}
