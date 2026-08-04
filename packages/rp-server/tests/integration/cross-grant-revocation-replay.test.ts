import { describe, it, expect } from "vitest";
import { setupTestRp } from "./test-helpers.js";
import { activateGrantOnContext, setupRevocationTestRp, signRevocationChallenge } from "./revocation-test-helpers.js";

// spec.md User Story 2, Acceptance Scenario 2 / SC-004: a revocation challenge issued for Grant
// A cannot be redeemed by presenting a signature produced over Grant A's own challenge value
// under Grant B's challengeId — the WebAuthn challenge-matching mechanism itself rejects the
// mismatch, and neither Grant's status changes (FR-006).
describe("Cross-grant revocation replay is denied (User Story 2)", () => {
  it("rejects a signature over challenge A presented under challenge B's challengeId", async () => {
    const ctx = await setupTestRp();
    const now = new Date();
    const duration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };

    const grantA = await activateGrantOnContext(ctx, { txTypes: ["transfer"], maxAmount: 500 }, duration, 0);
    const grantB = await activateGrantOnContext(
      ctx,
      { txTypes: ["withdraw"], maxAmount: 200 },
      duration,
      grantA.newCounter,
    );

    const { revocationService } = setupRevocationTestRp(ctx);

    const requestA = await revocationService.request({ grantNonce: grantA.grantNonce });
    expect(requestA.ok).toBe(true);
    if (!requestA.ok) return;
    const requestB = await revocationService.request({ grantNonce: grantB.grantNonce });
    expect(requestB.ok).toBe(true);
    if (!requestB.ok) return;

    // Sign challenge A's value, then present it under challenge B's challengeId.
    const assertionOverA = await signRevocationChallenge(ctx, requestA.result.options.challenge);
    const outcome = await revocationService.respond({
      challengeId: requestB.result.challengeId,
      assertionResponse: assertionOverA,
    });

    expect(outcome).toEqual({ ok: false, reason: "invalid_signature" });
    expect(ctx.grantStore.get(grantA.grantNonce)?.status).toBe("active");
    expect(ctx.grantStore.get(grantB.grantNonce)?.status).toBe("active");
  });
});
