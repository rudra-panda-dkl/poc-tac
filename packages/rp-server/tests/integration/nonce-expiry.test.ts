import { describe, it, expect } from "vitest";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
} from "./test-helpers.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// spec.md User Story 3, Scenario 3 (FR-013/SC-010): a `pending` Grant Record whose nonce
// validity window has elapsed before ceremony two completes is rejected as expired, and the
// Grant Record transitions to `expired`, not `active`.
describe("Nonce expiry rejects even a validly-signed credential (User Story 3)", () => {
  it("rejects and transitions to expired once the nonce window has elapsed", async () => {
    const nonceWindowSeconds = 0.1; // 100ms — short window for a fast test
    const ctx = await setupTestRp(nonceWindowSeconds);
    const requestedScope = { txTypes: ["transfer"] };
    const now = new Date();
    const requestedDuration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(), // 1 hour, well past the nonce window
    };
    const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, 0);
    if (!outcome.ok) throw new Error("setup failure");

    const agentPublicKeyJwk = await generateAgentPublicKeyJwk();
    const { credential } = await signTestCredential(
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

    await sleep(250); // well past the 100ms nonce window

    const activation = await ctx.validationService.activate(credential);
    expect(activation).toEqual({ ok: false, reason: "nonce_expired" });
    expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("expired");
  });
});
