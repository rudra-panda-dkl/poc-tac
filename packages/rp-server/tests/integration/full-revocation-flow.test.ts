import { describe, it, expect } from "vitest";
import { activateSingleGrantWithRevocation, signRevocationChallenge } from "./revocation-test-helpers.js";

// spec.md User Story 1 Independent Test / Acceptance Scenario 1 (SC-001): seed an active Grant
// Record, revoke it via a properly-authenticated request, and confirm both the RP's
// acknowledgment and the Grant Record's own persisted status.
describe("Full revocation flow (User Story 1)", () => {
  it("transitions the Grant Record to revoked and returns an explicit acknowledgment", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const requestOutcome = await revocationService.request({ grantNonce });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const assertionResponse = await signRevocationChallenge(ctx, requestOutcome.result.options.challenge);

    const respondOutcome = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse,
    });

    expect(respondOutcome).toEqual({ ok: true, grantNonce });
    expect(ctx.grantStore.get(grantNonce)?.status).toBe("revoked");
  });
});
