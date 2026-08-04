import { describe, it, expect } from "vitest";
import { activateTestGrant, seedGrantRecord } from "./transaction-test-helpers.js";

// spec.md User Story 2, Scenario 5 (SC-003/SC-004): across all denial categories, the RP issues
// no challenge on a request-time gate failure, and permits nothing on a respond-time failure.
describe("No side effects on any denial category (User Story 2)", () => {
  it("pending Grant: no challenge issued", async () => {
    const now = new Date();
    const { transactionService, grantNonce, challengeStore } = await seedGrantRecord({
      status: "pending",
      agreedScope: { txTypes: ["transfer"], maxAmount: 500 },
      agreedDuration: {
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 3600_000).toISOString(),
      },
    });

    transactionService.request({ grantNonce, txType: "transfer", amount: 100 });
    expect(challengeStore.sizeForTesting()).toBe(0);
  });

  it("out-of-scope request: no challenge issued", async () => {
    const now = new Date();
    const { transactionService, grantNonce, challengeStore } = await seedGrantRecord({
      status: "active",
      agreedScope: { txTypes: ["transfer"], maxAmount: 500 },
      agreedDuration: {
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 3600_000).toISOString(),
      },
    });

    transactionService.request({ grantNonce, txType: "withdraw", amount: 100 });
    expect(challengeStore.sizeForTesting()).toBe(0);
  });

  it("invalid signature: challenge is consumed but nothing is permitted, and the same challengeId cannot be retried", async () => {
    const now = new Date();
    const { transactionService, grantNonce } = await activateTestGrant(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const requestOutcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const firstRespond = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature: "not-a-real-signature",
    });
    expect(firstRespond).toEqual({ ok: false, reason: "invalid_signature" });

    // The challenge was consumed at retrieval (FR-008), so even a corrected retry is rejected —
    // no permit can ever be granted for this challengeId once the first attempt failed.
    const retryRespond = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature: "still-not-a-real-signature",
    });
    expect(retryRespond).toEqual({ ok: false, reason: "challenge_not_found" });
  });
});
