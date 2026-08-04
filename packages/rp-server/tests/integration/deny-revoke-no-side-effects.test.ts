import { describe, it, expect } from "vitest";
import { activateSingleGrantWithRevocation, signRevocationChallenge, seedRevocationTestGrant } from "./revocation-test-helpers.js";

// spec.md User Story 2, Scenario 5: across all denial categories, the RP issues no challenge on
// a request-time gate failure, and transitions no Grant Record on a respond-time failure.
describe("No side effects on any revocation denial category (User Story 2)", () => {
  it("pending Grant: no challenge issued", async () => {
    const now = new Date();
    const { revocationService, grantNonce, revocationChallengeStore } = seedRevocationTestGrant({
      status: "pending",
      agreedScope: { txTypes: ["transfer"], maxAmount: 500 },
      agreedDuration: {
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 3600_000).toISOString(),
      },
    });

    await revocationService.request({ grantNonce });
    expect(revocationChallengeStore.sizeForTesting()).toBe(0);
  });

  it("invalid signature: challenge is consumed but the Grant Record is not transitioned, and the same challengeId cannot be retried", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const requestOutcome = await revocationService.request({ grantNonce });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const firstRespond = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse: { garbage: true } as any,
    });
    expect(firstRespond).toEqual({ ok: false, reason: "invalid_signature" });
    expect(ctx.grantStore.get(grantNonce)?.status).toBe("active");

    // The challenge was consumed at retrieval (FR-007), so even a corrected retry is rejected.
    const correctedAssertion = await signRevocationChallenge(ctx, requestOutcome.result.options.challenge);
    const retryRespond = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse: correctedAssertion,
    });
    expect(retryRespond).toEqual({ ok: false, reason: "challenge_not_found" });
    expect(ctx.grantStore.get(grantNonce)?.status).toBe("active");
  });
});
