import { describe, it, expect } from "vitest";
import { seedGrantRecord } from "./transaction-test-helpers.js";

// spec.md User Story 2, Scenario 1 / SC-001: an `expired` Grant Record denies a transaction
// request with no challenge issued — same denial reason as `pending`, not distinguished
// (spec.md Edge Cases: an unknown/bogus grant reference isn't distinguished from "not active"
// either, so this feature doesn't leak Grant-state detail through denial reasons beyond the
// active/window/scope split).
describe("Transaction request denies an expired Grant (User Story 2)", () => {
  it("denies with no challenge issued", async () => {
    const now = new Date();
    const { transactionService, grantNonce, challengeStore } = await seedGrantRecord({
      status: "expired",
      agreedScope: { txTypes: ["transfer"], maxAmount: 500 },
      agreedDuration: {
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 3600_000).toISOString(),
      },
    });

    const outcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });

    expect(outcome).toEqual({ ok: false, reason: "grant_not_active" });
    expect(challengeStore.sizeForTesting()).toBe(0);
  });
});
