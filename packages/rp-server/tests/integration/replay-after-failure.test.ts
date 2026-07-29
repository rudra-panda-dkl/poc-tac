import { describe, it, expect } from "vitest";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
} from "./test-helpers.js";

// spec.md User Story 3, Scenario 2 (FR-014/FR-015): a grant nonce presented in a credential
// that fails a downstream check is rejected on a second presentation too — even before its
// validity window elapses — because the nonce was marked consumed at retrieval, not at
// successful verification.
describe("Replay after a failed downstream check is rejected (User Story 3)", () => {
  it("rejects a second, validly-signed presentation after the first attempt failed signature verification", async () => {
    const ctx = await setupTestRp();
    const requestedScope = { txTypes: ["transfer"] };
    const now = new Date();
    const requestedDuration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };
    const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, 0);
    if (!outcome.ok) throw new Error("setup failure");

    const agentPublicKeyJwk = await generateAgentPublicKeyJwk();
    const { credential: validCredential } = await signTestCredential(
      ctx,
      agentPublicKeyJwk,
      {
        rpIdentifier: outcome.result.rpIdentifier,
        scope: outcome.result.agreedScope,
        temporal: outcome.result.agreedDuration,
        assuranceLevel: outcome.result.assuranceLevel,
        grantNonce: outcome.result.nonce,
      },
      newCounter,
    );

    // First attempt: same nonce, corrupted signature — fails, but MUST still consume the nonce.
    const corrupted = {
      ...validCredential,
      integrity: {
        ...validCredential.integrity,
        userSignature: {
          ...validCredential.integrity.userSignature,
          response: { ...validCredential.integrity.userSignature.response, signature: "AAAAAAAAAAAAAAAAAAAA" },
        },
      },
    };
    const firstAttempt = await ctx.validationService.activate(corrupted);
    expect(firstAttempt).toEqual({ ok: false, reason: "invalid_signature" });

    // Second attempt: the ORIGINAL, validly-signed credential for the SAME nonce — still
    // rejected, because the nonce was already consumed by the first (failed) attempt.
    const secondAttempt = await ctx.validationService.activate(validCredential);
    expect(secondAttempt).toEqual({ ok: false, reason: "nonce_not_found" });
    expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("pending");
  });
});
