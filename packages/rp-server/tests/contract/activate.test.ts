import { describe, it, expect, afterEach } from "vitest";
import { signSoftwareAssertion } from "@tac/user-client/dist/demo/software-authenticator.js";
import { computeCredentialDigest, bufferToBase64url } from "@tac/shared";
import { startTestServer } from "./test-server.js";

// contracts/grant-api.yaml: POST /grant/activate — happy path only (failure-mode status codes
// are covered by the User Story 2/3 integration tests, which exercise the same endpoint's
// underlying service directly).
describe("POST /grant/activate (contract, happy path)", () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;

  afterEach(async () => {
    await server?.close();
  });

  it("activates a validly-signed credential end-to-end over real HTTP", async () => {
    server = await startTestServer();
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      server.seeded.privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );

    // Ceremony one over HTTP.
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
        requestedScope: { txTypes: ["contract-test"] },
        requestedDuration,
      }),
    });
    expect(negotiateRes.status).toBe(200);
    const negotiation = await negotiateRes.json();

    // Ceremony two: assemble + sign the credential, no further server round-trip beforehand.
    const agentPublicKeyJwk = await crypto.subtle
      .generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
      .then((kp) => crypto.subtle.exportKey("jwk", kp.publicKey));

    const identity = {
      userPublicKey: server.seeded.publicKeyJwk,
      agentPublicKey: agentPublicKeyJwk,
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
    const body = await activateRes.json();
    expect(body).toEqual({ status: "active", grantNonce: negotiation.nonce });
  });
});
