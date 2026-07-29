import type { AssuranceLevel, CredentialScope, UnsignedCredential } from "@tac/shared";
import type { AgentKeypair } from "../keypair/generate-keypair.js";

export interface AssembleCredentialInput {
  userPublicKey: JsonWebKey;
  rpIdentifier: string;
  agentKeypair: AgentKeypair;
  scope: CredentialScope;
  temporal: { validFrom: string; validUntil: string };
  grantNonce: string;
  assuranceLevel: AssuranceLevel;
}

/** FR-019: assembles the identity/scope/temporal blocks plus the pre-signature `integrity`
 * fields (`grantNonce`, `assuranceLevel`) — everything a Credential needs before ceremony
 * two's JCS digest can be computed (FR-008/FR-021). `integrity.userSignature` is deliberately
 * absent here: only the User's WebAuthn ceremony (user-client, ceremony two) can produce it. */
export function assembleUnsignedCredential(input: AssembleCredentialInput): UnsignedCredential {
  return {
    identity: {
      userPublicKey: input.userPublicKey,
      agentPublicKey: input.agentKeypair.publicKeyJwk,
      rpIdentifier: input.rpIdentifier,
    },
    scope: input.scope,
    temporal: input.temporal,
    integrity: {
      grantNonce: input.grantNonce,
      assuranceLevel: input.assuranceLevel,
    },
  };
}
