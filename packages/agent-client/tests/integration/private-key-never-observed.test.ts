import { describe, it, expect } from "vitest";
import { getOrCreateAgentKeypair } from "../../src/keypair/generate-keypair.js";
import { assembleUnsignedCredential } from "../../src/credential/assemble-credential.js";

// SC-006 / Constitution Principle VII: the Agent private key must never be observed on the
// wire or in storage, at any point. Rather than sniffing network traffic, this asserts the
// stronger guarantee that makes leakage structurally impossible: the private CryptoKey is
// generated non-extractable, so no code path in this process — let alone a network payload —
// can ever obtain its raw bytes.
describe("Agent private key is never observable (SC-006)", () => {
  it("generates a non-extractable private key", async () => {
    const keypair = await getOrCreateAgentKeypair("rp-under-test.example");
    expect(keypair.privateKey.extractable).toBe(false);
  });

  it("cannot be exported even by this process's own code", async () => {
    const keypair = await getOrCreateAgentKeypair("another-rp.example");
    await expect(crypto.subtle.exportKey("jwk", keypair.privateKey)).rejects.toThrow();
  });

  it("never appears in the assembled (pre-signature) credential — only the public key does", async () => {
    const keypair = await getOrCreateAgentKeypair("third-rp.example");
    const unsigned = assembleUnsignedCredential({
      userPublicKey: { kty: "EC", crv: "P-256", x: "stub", y: "stub" },
      rpIdentifier: "third-rp.example",
      agentKeypair: keypair,
      scope: { txTypes: ["demo"] },
      temporal: { validFrom: new Date().toISOString(), validUntil: new Date().toISOString() },
      grantNonce: "nonce-stub",
      assuranceLevel: "UP",
    });
    const serialized = JSON.stringify(unsigned);
    expect(serialized).not.toContain("\"d\":"); // JWK private-key component, absent by construction
    expect(unsigned.identity.agentPublicKey).toEqual(keypair.publicKeyJwk);
  });
});
