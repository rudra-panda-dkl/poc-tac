import { describe, it, expect } from "vitest";
import { seedGrantRecord } from "./transaction-test-helpers.js";

// spec.md User Story 2, Scenario 2 / SC-003: an active, in-window Grant still denies a
// transaction whose requested amount exceeds the agreed scope's maxAmount ceiling.
describe("Transaction request denies an over-maxAmount amount (User Story 2)", () => {
  it("denies with no challenge issued", async () => {
    const now = new Date();
    const { transactionService, grantNonce, challengeStore } = await seedGrantRecord({
      status: "active",
      agreedScope: { txTypes: ["transfer"], maxAmount: 500 },
      agreedDuration: {
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 3600_000).toISOString(),
      },
    });

    const outcome = transactionService.request({ grantNonce, txType: "transfer", amount: 999_999 });

    expect(outcome).toEqual({ ok: false, reason: "grant_out_of_scope" });
    expect(challengeStore.sizeForTesting()).toBe(0);
  });
});
