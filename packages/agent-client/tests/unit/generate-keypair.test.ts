import { describe, it, expect } from "vitest";
import { getOrCreateAgentKeypair } from "../../src/keypair/generate-keypair.js";

// Regression test for a real bug (specs/002-transact/tasks.md T012): `generateKey()` was
// originally called with only `["sign"]` usage, which left the *exported public* JWK with
// `key_ops: []` (no permitted operations) — the public key existed and looked plausible, but
// was unusable for verification. This went undetected in 001-grant because nothing there ever
// imported the Agent's public key for "verify"; 002-transact's signature-verification tests are
// what surfaced it. This test asserts the actual usability contract directly, at the source,
// so a regression here fails fast instead of surfacing as an unrelated-looking signature
// failure two features away.
describe("getOrCreateAgentKeypair() produces a verify-capable public key", () => {
  it("exports a public key JWK importable with 'verify' usage", async () => {
    const keypair = await getOrCreateAgentKeypair("verify-capable-test.example");

    await expect(
      crypto.subtle.importKey(
        "jwk",
        keypair.publicKeyJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      ),
    ).resolves.toBeDefined();
  });

  it("can actually verify a signature produced by the matching private key", async () => {
    const keypair = await getOrCreateAgentKeypair("verify-roundtrip-test.example");
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      keypair.publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    const data = new TextEncoder().encode("round-trip test payload");
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keypair.privateKey, data);

    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signature,
      data,
    );
    expect(verified).toBe(true);
  });
});
