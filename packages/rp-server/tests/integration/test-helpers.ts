import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorDevice } from "@simplewebauthn/types";
import type { AssuranceLevel, CredentialScope, UnsignedCredential } from "@tac/shared";
// Cross-package devDependency (rp-server -> @tac/user-client, tests-only) — reuses the same
// software authenticator the manual end-to-end demo run used, rather than re-implementing
// WebAuthn assertion signing a second time for tests.
import { signSoftwareAssertion } from "@tac/user-client/dist/demo/software-authenticator.js";
import { GrantRecordStore } from "../../src/models/grant-record-store.js";
import { RegisteredPasskeyStore } from "../../src/models/registered-passkey-store.js";
import { AssuranceCeilingPolicy } from "../../src/models/assurance-ceiling-policy.js";
import { NegotiationService } from "../../src/services/negotiation-service.js";
import { CredentialValidationService } from "../../src/services/credential-validation-service.js";
import { encodeP256CoseKey } from "../../src/services/cose-key.js";
import { RP_ID } from "../../src/services/webauthn.js";

export interface TestRpContext {
  grantStore: GrantRecordStore;
  passkeyStore: RegisteredPasskeyStore;
  ceilingPolicy: AssuranceCeilingPolicy;
  negotiationService: NegotiationService;
  validationService: CredentialValidationService;
  accountId: string;
  privateKey: CryptoKey;
  credentialId: string;
  userPublicKeyJwk: JsonWebKey;
}

export async function setupTestRp(nonceWindowSeconds = 300): Promise<TestRpContext> {
  const grantStore = new GrantRecordStore();
  const passkeyStore = new RegisteredPasskeyStore();
  const ceilingPolicy = AssuranceCeilingPolicy.defaultPolicy();
  const negotiationService = new NegotiationService(
    passkeyStore,
    grantStore,
    ceilingPolicy,
    RP_ID,
    nonceWindowSeconds,
  );
  const validationService = new CredentialValidationService(grantStore, passkeyStore);

  const accountId = "test-user";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const userPublicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const x = base64urlToBytes(userPublicKeyJwk.x!);
  const y = base64urlToBytes(userPublicKeyJwk.y!);
  const credentialPublicKey = encodeP256CoseKey(x, y);
  const credentialId = bytesToBase64url(crypto.getRandomValues(new Uint8Array(16)));

  const authenticator: AuthenticatorDevice = {
    credentialID: credentialId,
    credentialPublicKey,
    counter: 0,
    transports: ["internal"],
  };
  passkeyStore.register(accountId, authenticator, userPublicKeyJwk);

  return {
    grantStore,
    passkeyStore,
    ceilingPolicy,
    negotiationService,
    validationService,
    accountId,
    privateKey: keyPair.privateKey,
    credentialId,
    userPublicKeyJwk,
  };
}

/** Runs ceremony one against the given (already-negotiated) test context, returning both the
 * negotiation outcome and the WebAuthn counter value to feed into the next ceremony. */
export async function performCeremonyOne(
  ctx: TestRpContext,
  requestedScope: CredentialScope,
  requestedDuration: { validFrom: string; validUntil: string },
  counter: number,
) {
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "preferred" });
  const { assertionResponse, newCounter } = await signSoftwareAssertion({
    privateKey: ctx.privateKey,
    credentialId: ctx.credentialId,
    rpId: RP_ID,
    challenge: options.challenge,
    counter,
    userVerified: true,
  });
  const outcome = await ctx.negotiationService.negotiate({
    accountId: ctx.accountId,
    assertionResponse,
    expectedChallenge: options.challenge,
    requestedScope,
    requestedDuration,
  });
  return { outcome, newCounter };
}

/** Assembles + signs a Credential (ceremony two) against a given negotiation result. Accepts
 * scope/temporal/assuranceLevel/grantNonce overrides so tests can construct
 * intentionally-tampered credentials (User Story 2). */
export async function signTestCredential(
  ctx: TestRpContext,
  agentPublicKeyJwk: JsonWebKey,
  fields: {
    rpIdentifier: string;
    scope: CredentialScope;
    temporal: { validFrom: string; validUntil: string };
    assuranceLevel: AssuranceLevel;
    grantNonce: string;
    /** If provided, the digest is computed over THESE fields instead of `fields` above — lets
     * a test produce a validly-signed digest for the agreed terms while sending a tampered
     * credential body, to isolate "terms mismatch" from "signature invalid". */
    digestOverride?: {
      scope: CredentialScope;
      temporal: { validFrom: string; validUntil: string };
      assuranceLevel: AssuranceLevel;
      grantNonce: string;
    };
  },
  counter: number,
) {
  const { computeCredentialDigest, bufferToBase64url } = await import("@tac/shared");
  const digestInput = fields.digestOverride ?? fields;
  const digest = await computeCredentialDigest({
    identity: {
      userPublicKey: ctx.userPublicKeyJwk,
      agentPublicKey: agentPublicKeyJwk,
      rpIdentifier: fields.rpIdentifier,
    },
    scope: digestInput.scope,
    temporal: digestInput.temporal,
    assuranceLevel: digestInput.assuranceLevel,
    grantNonce: digestInput.grantNonce,
  });
  const challenge = bufferToBase64url(digest);
  const { assertionResponse, newCounter } = await signSoftwareAssertion({
    privateKey: ctx.privateKey,
    credentialId: ctx.credentialId,
    rpId: RP_ID,
    challenge,
    counter,
    userVerified: true,
  });

  const credential = {
    identity: {
      userPublicKey: ctx.userPublicKeyJwk,
      agentPublicKey: agentPublicKeyJwk,
      rpIdentifier: fields.rpIdentifier,
    },
    scope: fields.scope,
    temporal: fields.temporal,
    integrity: {
      grantNonce: fields.grantNonce,
      assuranceLevel: fields.assuranceLevel,
      userSignature: assertionResponse,
    },
  };

  return { credential, newCounter };
}

export async function generateAgentPublicKeyJwk(): Promise<JsonWebKey> {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  return crypto.subtle.exportKey("jwk", keyPair.publicKey);
}

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function bytesToBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type { UnsignedCredential };
