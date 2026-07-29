import { describe, it, expect, afterEach } from "vitest";
import { startTestServer } from "./test-server.js";

// contracts/grant-api.yaml: GET /grant/authenticate/options
describe("GET /grant/authenticate/options (contract)", () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;

  afterEach(async () => {
    await server?.close();
  });

  it("returns 200 with a WebAuthn PublicKeyCredentialRequestOptionsJSON body", async () => {
    server = await startTestServer();
    const res = await fetch(`${server.baseUrl}/grant/authenticate/options?accountId=demo-user`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.challenge).toBe("string");
    expect(body.challenge.length).toBeGreaterThan(0);
  });
});
