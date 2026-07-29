import { startAuthentication } from "@simplewebauthn/browser";
import { computeCredentialDigest, bufferToBase64url } from "@tac/shared";
import type { Credential, UnsignedCredential } from "@tac/shared";

/** Ceremony two (FR-003/FR-004/FR-005): computes the JCS digest of the unsigned credential
 * and completes a WebAuthn assertion with that digest as `challenge` — with NO server
 * round-trip between ceremony one and this call. The no-round-trip approach was empirically
 * validated against a real Chromium WebAuthn implementation by tasks.md T006 (see
 * specs/001-grant/research.md §1 Outcome) before this function was written. */
export async function runCeremonyTwo(unsignedCredential: UnsignedCredential): Promise<Credential> {
  const digest = await computeCredentialDigest({
    identity: unsignedCredential.identity,
    scope: unsignedCredential.scope,
    temporal: unsignedCredential.temporal,
    assuranceLevel: unsignedCredential.integrity.assuranceLevel,
    grantNonce: unsignedCredential.integrity.grantNonce,
  });
  const challenge = bufferToBase64url(digest);

  const userSignature = await startAuthentication({
    challenge,
    rpId: unsignedCredential.identity.rpIdentifier,
    userVerification: "preferred",
    timeout: 60000,
  });

  return {
    ...unsignedCredential,
    integrity: {
      ...unsignedCredential.integrity,
      userSignature,
    },
  };
}
