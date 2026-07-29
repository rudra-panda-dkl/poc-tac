import { describe, it, expect } from "vitest";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
} from "./test-helpers.js";

// spec.md User Story 2, Scenario 4: a presented credential's scope, duration, or assurance
// level does not match what was recorded at negotiation -> abort. Signed genuinely over the
// TAMPERED fields (no digestOverride) so this isolates "terms mismatch" from "invalid
// signature" — the signature is valid for what was sent, it just doesn't match what the RP
// agreed to at negotiation time.
describe("Abort on terms mismatch (User Story 2)", () => {
  it("rejects a credential whose scope was inflated beyond what was negotiated", async () => {
    const ctx = await setupTestRp();
    const requestedScope = { txTypes: ["transfer"], maxAmount: 100 };
    const now = new Date();
    const requestedDuration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };
    const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, 0);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const agentPublicKeyJwk = await generateAgentPublicKeyJwk();
    const inflatedScope = { txTypes: ["transfer"], maxAmount: 999_999 };
    const { credential } = await signTestCredential(
      ctx,
      agentPublicKeyJwk,
      {
        rpIdentifier: outcome.result.rpIdentifier,
        scope: inflatedScope, // does not match outcome.result.agreedScope
        temporal: outcome.result.agreedDuration,
        assuranceLevel: outcome.result.assuranceLevel,
        grantNonce: outcome.result.nonce,
      },
      newCounter,
    );

    const activation = await ctx.validationService.activate(credential);
    expect(activation).toEqual({ ok: false, reason: "terms_mismatch" });
    expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("pending");
  });

  it("rejects a credential whose duration was extended beyond what was negotiated", async () => {
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
    const extendedDuration = {
      validFrom: outcome.result.agreedDuration.validFrom,
      validUntil: new Date(now.getTime() + 30 * 24 * 3600_000).toISOString(), // 30 days instead of 1 hour
    };
    const { credential } = await signTestCredential(
      ctx,
      agentPublicKeyJwk,
      {
        rpIdentifier: outcome.result.rpIdentifier,
        scope: outcome.result.agreedScope,
        temporal: extendedDuration,
        assuranceLevel: outcome.result.assuranceLevel,
        grantNonce: outcome.result.nonce,
      },
      newCounter,
    );

    const activation = await ctx.validationService.activate(credential);
    expect(activation).toEqual({ ok: false, reason: "terms_mismatch" });
  });
});
