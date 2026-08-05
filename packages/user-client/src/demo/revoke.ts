import { readDemoState, writeDemoState, computeCredentialDigest, bufferToBase64url } from "@tac/shared";
import type { AssuranceLevel, UnsignedCredential } from "@tac/shared";
import { signSoftwareAssertion } from "./software-authenticator.js";

const RP_SERVER = process.env.TAC_RP_SERVER ?? "http://localhost:4000";
const RP_ID = process.env.TAC_RP_ID ?? "localhost";
const ACCOUNT_ID = "demo-user";

/** Self-contained manual demo for 003-revoke (quickstart.md Scenario 1): negotiates and
 * activates its own fresh grant, revokes it, then confirms a transaction attempt against it is
 * denied — all in one process, rather than chaining onto the separately-run demo:negotiate/
 * demo:sign scripts, so the demo doesn't depend on their run order. Uses the Node-compatible
 * software-authenticator signer throughout (like demo/negotiate.ts and demo/sign.ts), not
 * `ceremonies/revoke.ts`'s `runRevocation()`, which calls `startAuthentication()` and requires a
 * real browser — the same reason those two demo scripts don't call `ceremony-one.ts`/
 * `ceremony-two.ts` directly. Requires `npm run seed:passkey --workspace=@tac/rp-server` and a
 * running rp-server first. */
const state = await readDemoState();
if (!state.seededPasskey) {
  throw new Error('No seeded passkey found — run "npm run seed:passkey --workspace=@tac/rp-server" first.');
}
const { seededPasskey } = state;
const privateKey = await crypto.subtle.importKey(
  "jwk",
  seededPasskey.privateKeyJwk,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"],
);

// Ceremony one: authenticate + negotiate. Counter picks up where the live rp-server's stored
// counter for this passkey actually is — not a hardcoded 0 — since this script may run after
// demo:negotiate/demo:sign (or another demo:transact/demo:revoke run) already advanced it
// against the same long-lived server process; @simplewebauthn/server rejects any assertion
// whose counter doesn't strictly increase past what it already has on file.
const optionsRes = await fetch(`${RP_SERVER}/grant/authenticate/options?accountId=${ACCOUNT_ID}`);
if (!optionsRes.ok) {
  throw new Error(
    `authenticate/options failed: ${optionsRes.status} — is rp-server running with a seeded passkey?`,
  );
}
const options = (await optionsRes.json()) as { challenge: string };
const ceremonyOne = await signSoftwareAssertion({
  privateKey,
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

// Ceremony two: assemble + sign the credential. The Agent's public key is inert data for this
// demo — revocation authenticates the User, never the Agent (spec.md Edge Cases) — so a
// throwaway keypair suffices instead of a real @tac/agent-client one.
const agentKeyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const agentPublicKeyJwk = await crypto.subtle.exportKey("jwk", agentKeyPair.publicKey);

const unsignedCredential: UnsignedCredential = {
  identity: {
    userPublicKey: seededPasskey.publicKeyJwk,
    agentPublicKey: agentPublicKeyJwk,
    rpIdentifier: negotiation.rpIdentifier,
  },
  scope: negotiation.agreedScope,
  temporal: negotiation.agreedDuration,
  integrity: { grantNonce: negotiation.nonce, assuranceLevel: negotiation.assuranceLevel as AssuranceLevel },
};
const digest = await computeCredentialDigest({
  identity: unsignedCredential.identity,
  scope: unsignedCredential.scope,
  temporal: unsignedCredential.temporal,
  assuranceLevel: unsignedCredential.integrity.assuranceLevel,
  grantNonce: unsignedCredential.integrity.grantNonce,
});
const challenge = bufferToBase64url(digest);
const ceremonyTwo = await signSoftwareAssertion({
  privateKey,
  credentialId: seededPasskey.credentialId,
  rpId: RP_ID,
  challenge,
  counter: ceremonyOne.newCounter,
  userVerified: true,
});

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

// Revocation (FR-004): a single WebAuthn ceremony reusing ceremony one's mechanism.
const revokeRequestRes = await fetch(`${RP_SERVER}/revoke/request`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ grantNonce: negotiation.nonce }),
});
if (!revokeRequestRes.ok) {
  throw new Error(
    `revoke/request failed: ${revokeRequestRes.status} ${JSON.stringify(await revokeRequestRes.json())}`,
  );
}
const { challengeId, options: revokeOptions } = await revokeRequestRes.json();

const revocationAssertion = await signSoftwareAssertion({
  privateKey,
  credentialId: seededPasskey.credentialId,
  rpId: RP_ID,
  challenge: revokeOptions.challenge,
  counter: ceremonyTwo.newCounter,
  userVerified: true,
});
// Persist the counter forward — this is the last WebAuthn assertion this script makes — so any
// later demo script chained after this one needs this value, not a stale one.
await writeDemoState({ lastCounter: revocationAssertion.newCounter });

const revokeRespondRes = await fetch(`${RP_SERVER}/revoke/respond`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ challengeId, assertionResponse: revocationAssertion.assertionResponse }),
});
if (!revokeRespondRes.ok) {
  throw new Error(
    `revoke/respond failed: ${revokeRespondRes.status} ${JSON.stringify(await revokeRespondRes.json())}`,
  );
}
console.log("Grant revoked:", JSON.stringify(await revokeRespondRes.json()));

// Confirm the effect (FR-012, SC-002): a transaction attempt against the just-revoked Grant is
// denied by 002-transact's existing, unmodified Grant-state gate.
const txRes = await fetch(`${RP_SERVER}/transact/request`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ grantNonce: negotiation.nonce, txType: "demo-transfer", amount: 50 }),
});
const txResult = await txRes.json();
console.log(`Transaction attempt after revocation: ${txRes.status} ${JSON.stringify(txResult)}`);
if (txRes.ok) {
  throw new Error("Expected the transaction attempt to be denied after revocation, but it succeeded.");
}
console.log("Confirmed: transaction denied after revocation.");
