import { describe, it, expect, afterEach } from "vitest";
import { signSoftwareAssertion } from "@tac/user-client/dist/demo/software-authenticator.js";
import { startTestServer } from "./test-server.js";

// contracts/grant-api.yaml: POST /grant/negotiate — response MUST include rpIdentifier (the
// only pre-delivery information the Agent may receive, FR-018a) and MUST NOT omit any of the
// other fields the contract requires.
describe("POST /grant/negotiate (contract)", () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;

  afterEach(async () => {
    await server?.close();
  });

  it("returns 200 with the full negotiated-terms schema, including rpIdentifier", async () => {
    server = await startTestServer();

    const optionsRes = await fetch(`${server.baseUrl}/grant/authenticate/options?accountId=demo-user`);
    const options = await optionsRes.json();

    const privateKey = await crypto.subtle.importKey(
      "jwk",
      server.seeded.privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const { assertionResponse } = await signSoftwareAssertion({
      privateKey,
      credentialId: server.seeded.credentialId,
      rpId: "localhost",
      challenge: options.challenge,
      counter: 0,
      userVerified: true,
    });

    const now = new Date();
    const res = await fetch(`${server.baseUrl}/grant/negotiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "demo-user",
        assertionResponse,
        requestedScope: { txTypes: ["contract-test"] },
        requestedDuration: {
          validFrom: now.toISOString(),
          validUntil: new Date(now.getTime() + 3600_000).toISOString(),
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      nonce: expect.any(String),
      agreedScope: { txTypes: ["contract-test"] },
      assuranceLevel: "UP+UV",
      rpIdentifier: "localhost",
      nonceExpiresAt: expect.any(String),
    });
    expect(body.agreedDuration).toBeDefined();
    // FR-018a: this response is what the Agent must NEVER see beyond rpIdentifier — verified
    // at the code level by generate-keypair.ts's signature (see private-key-never-observed
    // test); this contract test only asserts the schema itself is complete.
  });

  it("rejects a request with no matching pending challenge (never fetched options first)", async () => {
    server = await startTestServer();
    const res = await fetch(`${server.baseUrl}/grant/negotiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: "demo-user",
        assertionResponse: {},
        requestedScope: {},
        requestedDuration: { validFrom: new Date().toISOString(), validUntil: new Date().toISOString() },
      }),
    });
    expect(res.status).toBe(401);
  });
});
