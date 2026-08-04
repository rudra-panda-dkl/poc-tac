import { describe, it, expect, afterEach } from "vitest";
import { signSoftwareAssertion } from "@tac/user-client/dist/demo/software-authenticator.js";
import { computeCredentialDigest, bufferToBase64url } from "@tac/shared";
import { getOrCreateAgentKeypair } from "@tac/agent-client/dist/keypair/generate-keypair.js";
import { startTestServer } from "./test-server.js";

// contracts/revoke-api.yaml: POST /revoke/respond — happy path only (denial-mode status codes
// are covered by the User Story 2/3 integration tests, which exercise the same endpoint's
// underlying service directly).
describe("POST /revoke/respond (contract, happy path)", () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;

  afterEach(async () => {
    await server?.close();
  });

  it("revokes an active Grant end-to-end over real HTTP", async () => {
    server = await startTestServer();
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      server.seeded.privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );

    const optionsRes = await fetch(`${server.baseUrl}/grant/authenticate/options?accountId=demo-user`);
    const options = await optionsRes.json();
    const ceremonyOne = await signSoftwareAssertion({
      privateKey,
      credentialId: server.seeded.credentialId,
      rpId: "localhost",
      challenge: options.challenge,
      counter: 0,
      userVerified: true,
    });

    const now = new Date();
    const requestedDuration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };
    const negotiateRes = await fetch(`${server.baseUrl}/grant/negotiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "demo-user",
        assertionResponse: ceremonyOne.assertionResponse,
        requestedScope: { txTypes: ["transfer"], maxAmount: 500 },
        requestedDuration,
      }),
    });
    const negotiation = await negotiateRes.json();

    const agentKeypair = await getOrCreateAgentKeypair(`revoke-respond-contract-test-${crypto.randomUUID()}`);
    const identity = {
      userPublicKey: server.seeded.publicKeyJwk,
      agentPublicKey: agentKeypair.publicKeyJwk,
      rpIdentifier: negotiation.rpIdentifier,
    };
    const digest = await computeCredentialDigest({
      identity,
      scope: negotiation.agreedScope,
      temporal: negotiation.agreedDuration,
      assuranceLevel: negotiation.assuranceLevel,
      grantNonce: negotiation.nonce,
    });
    const challenge = bufferToBase64url(digest);
    const ceremonyTwo = await signSoftwareAssertion({
      privateKey,
      credentialId: server.seeded.credentialId,
      rpId: "localhost",
      challenge,
      counter: ceremonyOne.newCounter,
      userVerified: true,
    });

    await fetch(`${server.baseUrl}/grant/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity,
        scope: negotiation.agreedScope,
        temporal: negotiation.agreedDuration,
        integrity: {
          grantNonce: negotiation.nonce,
          assuranceLevel: negotiation.assuranceLevel,
          userSignature: ceremonyTwo.assertionResponse,
        },
      }),
    });

    const revokeRequestRes = await fetch(`${server.baseUrl}/revoke/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantNonce: negotiation.nonce }),
    });
    const { challengeId, options: revokeOptions } = await revokeRequestRes.json();

    const revocationAssertion = await signSoftwareAssertion({
      privateKey,
      credentialId: server.seeded.credentialId,
      rpId: "localhost",
      challenge: revokeOptions.challenge,
      counter: ceremonyTwo.newCounter,
      userVerified: true,
    });

    const revokeRespondRes = await fetch(`${server.baseUrl}/revoke/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, assertionResponse: revocationAssertion.assertionResponse }),
    });

    expect(revokeRespondRes.status).toBe(200);
    const body = await revokeRespondRes.json();
    expect(body).toEqual({ status: "revoked", grantNonce: negotiation.nonce });
  });
});
