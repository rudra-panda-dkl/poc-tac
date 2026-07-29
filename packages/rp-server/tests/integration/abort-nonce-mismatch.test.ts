import { describe, it, expect } from "vitest";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
} from "./test-helpers.js";

// spec.md User Story 2, Scenario 3: a presented credential embeds a nonce that does not match
// the record's own nonce -> abort. Since Grant Records are keyed by nonce, an unrecognized
// nonce surfaces as "not found" — which is the correct rejection either way (FR-015 requires
// treating any non-redeemable nonce identically, whether never-issued or already-consumed).
describe("Abort on nonce mismatch (User Story 2)", () => {
  it("rejects a credential referencing a nonce that was never issued", async () => {
    const ctx = await setupTestRp();
    const requestedScope = { txTypes: ["transfer"] };
    const now = new Date();
    const requestedDuration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };
    const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, 0);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const agentPublicKeyJwk = await generateAgentPublicKeyJwk();
    const bogusNonce = "00000000-0000-0000-0000-000000000000";
    const { credential } = await signTestCredential(
      ctx,
      agentPublicKeyJwk,
      {
        rpIdentifier: outcome.result.rpIdentifier,
        scope: outcome.result.agreedScope,
        temporal: outcome.result.agreedDuration,
        assuranceLevel: outcome.result.assuranceLevel,
        grantNonce: bogusNonce, // never issued by negotiate()
      },
      newCounter,
    );

    const activation = await ctx.validationService.activate(credential);
    expect(activation).toEqual({ ok: false, reason: "nonce_not_found" });
    // The genuinely-issued record is untouched — still pending.
    expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("pending");
  });
});
