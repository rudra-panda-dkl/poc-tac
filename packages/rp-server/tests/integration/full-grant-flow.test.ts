import { describe, it, expect } from "vitest";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
} from "./test-helpers.js";

// spec.md User Story 1 Independent Test: run the flow end-to-end and confirm the RP's
// persisted record reaches status `active` with the correct scope, duration, and assurance
// level (SC-005).
describe("Full grant flow (User Story 1)", () => {
  it("reaches active status with the correct scope, duration, and assurance level", async () => {
    const ctx = await setupTestRp();
    const requestedScope = { txTypes: ["transfer"], maxAmount: 500 };
    const now = new Date();
    const requestedDuration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };

    const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, 0);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // FR-010: pending record exists with the agreed terms before ceremony two runs.
    const pendingRecord = ctx.grantStore.peekForTesting(outcome.result.nonce);
    expect(pendingRecord?.status).toBe("pending");

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

    const activation = await ctx.validationService.activate(credential);
    expect(activation.ok).toBe(true);

    const record = ctx.grantStore.peekForTesting(outcome.result.nonce);
    expect(record?.status).toBe("active");
    expect(record?.agreedScope).toEqual(requestedScope);
    expect(record?.agreedDuration).toEqual(requestedDuration);
    expect(record?.assuranceLevel).toBe("UP+UV");
  });
});
