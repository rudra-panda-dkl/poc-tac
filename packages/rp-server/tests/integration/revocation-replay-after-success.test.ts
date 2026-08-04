import { describe, it, expect } from "vitest";
import { activateSingleGrantWithRevocation, signRevocationChallenge } from "./revocation-test-helpers.js";

// spec.md User Story 3, Scenario 1 / SC-005: a challenge that has already been successfully
// redeemed is rejected on a second presentation.
describe("Revocation challenge replay after success is rejected (User Story 3)", () => {
  it("rejects a second presentation of an already-redeemed challengeId", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const requestOutcome = await revocationService.request({ grantNonce });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const assertionResponse = await signRevocationChallenge(ctx, requestOutcome.result.options.challenge);

    const first = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse,
    });
    expect(first.ok).toBe(true);

    const replay = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse,
    });
    expect(replay).toEqual({ ok: false, reason: "challenge_not_found" });
  });
});
