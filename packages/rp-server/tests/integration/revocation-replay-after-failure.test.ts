import { describe, it, expect } from "vitest";
import { activateSingleGrantWithRevocation, signRevocationChallenge } from "./revocation-test-helpers.js";

// spec.md User Story 3, Scenario 2: a challenge first presented with an invalid signature, then
// retried with a corrected, validly-signed response under the SAME challengeId, is still
// rejected — because consumedAt was set at first retrieval (FR-007), not at first success.
describe("Revocation challenge replay after a failed attempt is still rejected (User Story 3)", () => {
  it("rejects a corrected retry under the same challengeId that first failed signature verification", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const requestOutcome = await revocationService.request({ grantNonce });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const firstAttempt = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse: { garbage: true } as any,
    });
    expect(firstAttempt).toEqual({ ok: false, reason: "invalid_signature" });

    const correctedAssertion = await signRevocationChallenge(ctx, requestOutcome.result.options.challenge);
    const retry = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse: correctedAssertion,
    });

    expect(retry).toEqual({ ok: false, reason: "challenge_not_found" });
  });
});
