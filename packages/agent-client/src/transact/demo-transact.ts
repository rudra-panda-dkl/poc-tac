import { computeCredentialDigest, bufferToBase64url, readDemoState, writeDemoState } from "@tac/shared";
import type { AssuranceLevel, UnsignedCredential } from "@tac/shared";
// Cross-package devDependency (agent-client -> @tac/user-client, demo-only) — reuses the same
// software authenticator the grant-flow demo uses, rather than re-implementing WebAuthn
// assertion signing a second time.
import { signSoftwareAssertion } from "@tac/user-client/dist/demo/software-authenticator.js";
import { getOrCreateAgentKeypair } from "../keypair/generate-keypair.js";
import { assembleUnsignedCredential } from "../credential/assemble-credential.js";
import { signTransactionResponse } from "./sign-transaction-response.js";

/** Self-contained manual demo for 002-transact (quickstart.md Scenario 1). Deliberately does
 * NOT chain onto 001-grant's separately-run `demo:negotiate`/`demo:keypair`/`demo:sign` CLI
 * steps: the Agent's private key is non-extractable and lives only in the process that
 * generated it (FR-017), so a later `npx tsx` invocation can never recover the same key a prior
 * invocation used to activate a grant. This script instead runs the full grant negotiation,
 * activation, AND the transaction request/respond round-trip in one process, so the same
 * in-memory Agent keypair is used consistently throughout — the request/respond split is an
 * HTTP-protocol round-trip within a single Agent actor, not an actor-boundary split like grant's
 * three separate ceremonies, so there is no reason to spread it across separate CLI processes.
 * Requires `npm run seed:passkey --workspace=@tac/rp-server` and a running rp-server first. */
const RP_SERVER = process.env.TAC_RP_SERVER ?? "http://localhost:4000";
const RP_ID = process.env.TAC_RP_ID ?? "localhost";
const ACCOUNT_ID = "demo-user";

// This demo needs the seeded passkey's own private key (to drive both WebAuthn ceremonies
// itself, standing in for the User) — read it back the same way sign.ts does.
const state = await readDemoState();
if (!state.seededPasskey) {
  throw new Error('No seeded passkey found — run "npm run seed:passkey --workspace=@tac/rp-server" first.');
}
const { seededPasskey } = state;
const userPrivateKey = await crypto.subtle.importKey(
  "jwk",
  seededPasskey.privateKeyJwk,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"],
);

const agentKeypair = await getOrCreateAgentKeypair(RP_ID);

// Ceremony one: authenticate + negotiate (FR-003/FR-006/FR-007/FR-010). Counter picks up where
// the live rp-server's stored counter for this passkey actually is — not a hardcoded 0 — since
// this script may run after demo:negotiate/demo:sign (or another demo:transact/demo:revoke run)
// already advanced it against the same long-lived server process; @simplewebauthn/server rejects
// any assertion whose counter doesn't strictly increase past what it already has on file.
const optionsRes = await fetch(`${RP_SERVER}/grant/authenticate/options?accountId=${ACCOUNT_ID}`);
const options = (await optionsRes.json()) as { challenge: string };
const ceremonyOne = await signSoftwareAssertion({
  privateKey: userPrivateKey,
  credentialId: seededPasskey.credentialId,
  rpId: RP_ID,
  challenge: options.challenge,
  counter: state.lastCounter ?? 0,
  userVerified: true,
});

const now = new Date();
const requestedScope = { txTypes: ["demo-transfer"], maxAmount: 100 };
const requestedDuration = {
  validFrom: now.toISOString(),
  validUntil: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
};
const negotiateRes = await fetch(`${RP_SERVER}/grant/negotiate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    accountId: ACCOUNT_ID,
    assertionResponse: ceremonyOne.assertionResponse,
    requestedScope,
    requestedDuration,
  }),
});
if (!negotiateRes.ok) {
  throw new Error(`negotiate failed: ${negotiateRes.status} ${JSON.stringify(await negotiateRes.json())}`);
}
const negotiation = await negotiateRes.json();

// Ceremony two: assemble + sign the credential (FR-019/FR-021), no server round-trip between
// ceremony one and this step.
const unsignedCredential: UnsignedCredential = assembleUnsignedCredential({
  userPublicKey: seededPasskey.publicKeyJwk,
  rpIdentifier: negotiation.rpIdentifier,
  agentKeypair,
  scope: negotiation.agreedScope,
  temporal: negotiation.agreedDuration,
  grantNonce: negotiation.nonce,
  assuranceLevel: negotiation.assuranceLevel as AssuranceLevel,
});
const digest = await computeCredentialDigest({
  identity: unsignedCredential.identity,
  scope: unsignedCredential.scope,
  temporal: unsignedCredential.temporal,
  assuranceLevel: unsignedCredential.integrity.assuranceLevel,
  grantNonce: unsignedCredential.integrity.grantNonce,
});
const challenge = bufferToBase64url(digest);
const ceremonyTwo = await signSoftwareAssertion({
  privateKey: userPrivateKey,
  credentialId: seededPasskey.credentialId,
  rpId: RP_ID,
  challenge,
  counter: ceremonyOne.newCounter,
  userVerified: true,
});
// Persist the counter forward — this is the last WebAuthn assertion this script makes (the
// transaction request/respond below signs with the Agent's own raw ECDSA key, not the User's
// passkey), so any later demo script chained after this one needs this value, not a stale one.
await writeDemoState({ lastCounter: ceremonyTwo.newCounter });

const credential = {
  ...unsignedCredential,
  integrity: { ...unsignedCredential.integrity, userSignature: ceremonyTwo.assertionResponse },
};
const activateRes = await fetch(`${RP_SERVER}/grant/activate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(credential),
});
if (!activateRes.ok) {
  throw new Error(`activate failed: ${activateRes.status} ${JSON.stringify(await activateRes.json())}`);
}
console.log("Grant activated:", JSON.stringify(await activateRes.json()));

// Transaction request/respond (FR-001 through FR-012) — no human present for this half.
const txType = "demo-transfer";
const amount = 50;
const requestRes = await fetch(`${RP_SERVER}/transact/request`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ grantNonce: negotiation.nonce, txType, amount }),
});
if (!requestRes.ok) {
  throw new Error(`transact/request failed: ${requestRes.status} ${JSON.stringify(await requestRes.json())}`);
}
const { challengeId, challenge: txChallenge } = await requestRes.json();
console.log("Transaction challenge issued:", challengeId);

const signature = await signTransactionResponse(agentKeypair, { challenge: txChallenge, txType, amount });
const respondRes = await fetch(`${RP_SERVER}/transact/respond`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ challengeId, signature }),
});
const result = await respondRes.json();
if (!respondRes.ok) {
  throw new Error(`transact/respond failed: ${respondRes.status} ${JSON.stringify(result)}`);
}

console.log("Transaction permitted:");
console.log(JSON.stringify(result, null, 2));
