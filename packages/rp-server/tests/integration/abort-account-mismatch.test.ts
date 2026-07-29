import { describe, it, expect } from "vitest";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
} from "./test-helpers.js";

// spec.md User Story 2, Scenario 1: a presented credential's User public key does not match
// the RP's own passkey registration record for the claimed account -> abort, record stays
// `pending`.
describe("Abort on account/public-key mismatch (User Story 2)", () => {
  it("rejects a credential whose identity.userPublicKey doesn't match the registered account", async () => {
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
    // Substitute a bogus userPublicKey after signing over the real one — simulates a
    // credential whose identity block was tampered post-assembly.
    const tampered = {
      ...credential,
      identity: { ...credential.identity, userPublicKey: { kty: "EC", crv: "P-256", x: "bogus", y: "bogus" } },
    };

    const activation = await ctx.validationService.activate(tampered);
    expect(activation).toEqual({ ok: false, reason: "account_mismatch" });
    expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("pending");
  });
});
