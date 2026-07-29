import { readDemoState, writeDemoState } from "@tac/shared";
import { signSoftwareAssertion } from "./software-authenticator.js";

const RP_SERVER = process.env.TAC_RP_SERVER ?? "http://localhost:4000";
const RP_ID = process.env.TAC_RP_ID ?? "localhost";
const ACCOUNT_ID = "demo-user";

const state = await readDemoState();
if (!state.seededPasskey) {
  throw new Error(
    'No seeded passkey found in demo-state.json — run "npm run seed:passkey --workspace=@tac/rp-server" first.',
  );
}

// Ceremony one, part 1: fetch the server-issued challenge (FR-003).
const optionsRes = await fetch(`${RP_SERVER}/grant/authenticate/options?accountId=${ACCOUNT_ID}`);
if (!optionsRes.ok) {
  throw new Error(`authenticate/options failed: ${optionsRes.status}`);
}
const options = (await optionsRes.json()) as { challenge: string };

// Ceremony one, part 2: authenticate. Uses the software authenticator (this demo runs in
// plain Node, not a browser) signing with the SAME private key rp-server registered — see
// seed.ts's seedFromDemoStateOrFresh for why these must be the same keypair across processes.
const privateKey = await crypto.subtle.importKey(
  "jwk",
  state.seededPasskey.privateKeyJwk,
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"],
);
const { assertionResponse, newCounter } = await signSoftwareAssertion({
  privateKey,
  credentialId: state.seededPasskey.credentialId,
  rpId: RP_ID,
  challenge: options.challenge,
  counter: state.lastCounter ?? 0,
  userVerified: true, // demo requests UP+UV assurance
});

// Ceremony one, part 3: negotiate scope/duration (FR-006/FR-007/FR-007a/FR-010).
const requestedScope = { txTypes: ["demo-transfer"], maxAmount: 100 };
const now = new Date();
const requestedDuration = {
  validFrom: now.toISOString(),
  validUntil: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
};

const negotiateRes = await fetch(`${RP_SERVER}/grant/negotiate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    accountId: ACCOUNT_ID,
    assertionResponse,
    requestedScope,
    requestedDuration,
  }),
});
if (!negotiateRes.ok) {
  const err = await negotiateRes.json().catch(() => ({}));
  throw new Error(`negotiate failed: ${negotiateRes.status} ${JSON.stringify(err)}`);
}
const negotiation = await negotiateRes.json();

await writeDemoState({
  negotiation: { accountId: ACCOUNT_ID, ...negotiation },
  lastCounter: newCounter,
});

console.log("Ceremony one complete. Negotiated terms:");
console.log(JSON.stringify(negotiation, null, 2));
