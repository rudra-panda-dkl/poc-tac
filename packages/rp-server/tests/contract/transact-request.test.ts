import { describe, it, expect, afterEach } from "vitest";
import { signSoftwareAssertion } from "@tac/user-client/dist/demo/software-authenticator.js";
import { computeCredentialDigest, bufferToBase64url } from "@tac/shared";
import { getOrCreateAgentKeypair } from "@tac/agent-client/dist/keypair/generate-keypair.js";
import { startTestServer } from "./test-server.js";

// contracts/transact-api.yaml: POST /transact/request — happy path only (denial-mode status
// codes are covered by the User Story 2 integration tests, which exercise the same endpoint's
// underlying service directly).
describe("POST /transact/request (contract, happy path)", () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;

  afterEach(async () => {
    await server?.close();
  });

  it("issues a fresh challenge for an in-scope, in-window transaction against an active Grant", async () => {
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

    const agentKeypair = await getOrCreateAgentKeypair(`contract-test-request-${crypto.randomUUID()}`);
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

    const activateRes = await fetch(`${server.baseUrl}/grant/activate`, {
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
    expect(activateRes.status).toBe(200);

    const requestRes = await fetch(`${server.baseUrl}/transact/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantNonce: negotiation.nonce, txType: "transfer", amount: 100 }),
    });

    expect(requestRes.status).toBe(200);
    const body = await requestRes.json();
    expect(typeof body.challengeId).toBe("string");
    expect(typeof body.challenge).toBe("string");
    expect(typeof body.expiresAt).toBe("string");
  });
});
