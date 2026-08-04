import { describe, it, expect } from "vitest";
import { activateSingleGrantWithRevocation, signRevocationChallenge } from "./revocation-test-helpers.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// data-model.md validation rules + spec.md Assumptions (short-lived challenge window): a
// challenge presented after its own expiresAt has elapsed is rejected, mirroring
// 002-transact's challenge_expired handling — even with an otherwise-valid signature.
describe("Revocation challenge expiry rejects even a validly-signed response (User Story 3)", () => {
  it("rejects once the challenge window has elapsed", async () => {
    const now = new Date();
    const challengeWindowSeconds = 0.1; // 100ms — short window for a fast test
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
      challengeWindowSeconds,
    );

    const requestOutcome = await revocationService.request({ grantNonce });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const assertionResponse = await signRevocationChallenge(ctx, requestOutcome.result.options.challenge);

    await sleep(250); // well past the 100ms challenge window

    const outcome = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse,
    });

    expect(outcome).toEqual({ ok: false, reason: "challenge_expired" });
  });
});
