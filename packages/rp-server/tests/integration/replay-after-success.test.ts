import { describe, it, expect } from "vitest";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
} from "./test-helpers.js";

// spec.md User Story 3, Scenario 1 (SC-002/SC-007): a grant nonce that has already been
// successfully redeemed is rejected on any subsequent presentation.
describe("Replay after success is rejected (User Story 3)", () => {
  it("rejects a second presentation of an already-activated credential", async () => {
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

    const first = await ctx.validationService.activate(credential);
    expect(first.ok).toBe(true);

    const replay = await ctx.validationService.activate(credential);
    expect(replay).toEqual({ ok: false, reason: "nonce_not_found" });
    expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("active");
  });
});
