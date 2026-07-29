import { readDemoState, writeDemoState, computeCredentialDigest, bufferToBase64url } from "@tac/shared";
import type { AssuranceLevel, UnsignedCredential } from "@tac/shared";
import { signSoftwareAssertion } from "./software-authenticator.js";

const RP_SERVER = process.env.TAC_RP_SERVER ?? "http://localhost:4000";
const RP_ID = process.env.TAC_RP_ID ?? "localhost";

const state = await readDemoState();
if (!state.negotiation) {
  throw new Error('No negotiation found — run "npm run demo:negotiate --workspace=@tac/user-client" first.');
}
if (!state.agentPublicKeyJwk) {
  throw new Error('No Agent keypair found — run "npm run demo:keypair --workspace=@tac/agent-client" first.');
}
if (!state.seededPasskey) {
  throw new Error('No seeded passkey found — run "npm run seed:passkey --workspace=@tac/rp-server" first.');
}

const { negotiation, agentPublicKeyJwk, seededPasskey } = state;

// Credential assembly (FR-019/FR-008) — normally agent-client's job (assemble-credential.ts);
// replicated here inline since this demo script only has access to the negotiation result and
// the Agent's already-generated public key, both via demo-state.json.
const unsignedCredential: UnsignedCredential = {
  identity: {
    userPublicKey: seededPasskey.publicKeyJwk,
    agentPublicKey: agentPublicKeyJwk,
    rpIdentifier: negotiation.rpIdentifier,
  },
  scope: negotiation.agreedScope,
  temporal: negotiation.agreedDuration,
  integrity: {
    grantNonce: negotiation.nonce,
    assuranceLevel: negotiation.assuranceLevel as AssuranceLevel,
  },
};

// Ceremony two (FR-003/FR-004/FR-005/FR-021): digest computed locally, no server round-trip
// between ceremony one and this signing step.
const digest = await computeCredentialDigest({
  identity: unsignedCredential.identity,
  scope: unsignedCredential.scope,
  temporal: unsignedCredential.temporal,
  assuranceLevel: unsignedCredential.integrity.assuranceLevel,
  grantNonce: unsignedCredential.integrity.grantNonce,
});
const challenge = bufferToBase64url(digest);

const privateKey = await crypto.subtle.importKey(
  "jwk",
  seededPasskey.privateKeyJwk,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"],
);
const { assertionResponse, newCounter } = await signSoftwareAssertion({
  privateKey,
  credentialId: seededPasskey.credentialId,
  rpId: RP_ID,
  challenge,
  counter: state.lastCounter ?? 0,
  userVerified: true,
});
await writeDemoState({ lastCounter: newCounter });

const credential = {
  ...unsignedCredential,
  integrity: {
    ...unsignedCredential.integrity,
    userSignature: assertionResponse,
  },
};

const activateRes = await fetch(`${RP_SERVER}/grant/activate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(credential),
});
const result = await activateRes.json();

if (!activateRes.ok) {
  throw new Error(`activate failed: ${activateRes.status} ${JSON.stringify(result)}`);
}

console.log("Ceremony two complete. Grant activated:");
console.log(JSON.stringify(result, null, 2));
