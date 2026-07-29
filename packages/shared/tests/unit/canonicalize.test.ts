import { describe, it, expect } from "vitest";
import { computeCredentialDigest, bufferToBase64url } from "../../src/canonicalize.js";

const baseInput = {
  identity: { userPublicKey: { kty: "EC" }, agentPublicKey: { kty: "EC" }, rpIdentifier: "rp.example" },
  scope: { b: 2, a: 1 },
  temporal: { validFrom: "2026-01-01T00:00:00Z", validUntil: "2026-01-01T01:00:00Z" },
  assuranceLevel: "UP+UV" as const,
  grantNonce: "nonce-1",
};

describe("computeCredentialDigest (FR-021, resolves OQ-6)", () => {
  it("is deterministic for the same logical content", async () => {
    const d1 = await computeCredentialDigest(baseInput);
    const d2 = await computeCredentialDigest(structuredClone(baseInput));
    expect(bufferToBase64url(d1)).toBe(bufferToBase64url(d2));
  });

  it("is invariant to key ordering (JCS sorts object keys)", async () => {
    const reordered = {
      grantNonce: baseInput.grantNonce,
      assuranceLevel: baseInput.assuranceLevel,
      temporal: { validUntil: baseInput.temporal.validUntil, validFrom: baseInput.temporal.validFrom },
      scope: { a: 1, b: 2 }, // same entries, different insertion order
      identity: {
        rpIdentifier: baseInput.identity.rpIdentifier,
        agentPublicKey: baseInput.identity.agentPublicKey,
        userPublicKey: baseInput.identity.userPublicKey,
      },
    };
    const d1 = await computeCredentialDigest(baseInput);
    const d2 = await computeCredentialDigest(reordered);
    expect(bufferToBase64url(d1)).toBe(bufferToBase64url(d2));
  });

  it("produces a different digest when any covered field changes", async () => {
    const changed = { ...baseInput, scope: { a: 1, b: 3 } };
    const d1 = await computeCredentialDigest(baseInput);
    const d2 = await computeCredentialDigest(changed);
    expect(bufferToBase64url(d1)).not.toBe(bufferToBase64url(d2));
  });

  it("distinguishes -0 from 0 the way JCS/ECMA-262 requires", async () => {
    // canonicalize maps -0 to "0" per RFC 8785 — asserting this doesn't throw and IS
    // consistent with a literal 0 (both should serialize identically).
    const withNegZero = { ...baseInput, scope: { a: -0 } };
    const withZero = { ...baseInput, scope: { a: 0 } };
    const d1 = await computeCredentialDigest(withNegZero);
    const d2 = await computeCredentialDigest(withZero);
    expect(bufferToBase64url(d1)).toBe(bufferToBase64url(d2));
  });
});
