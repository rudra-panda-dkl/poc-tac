import { describe, it, expect } from "vitest";
import { seedGrantRecord } from "./transaction-test-helpers.js";

// spec.md User Story 2, Scenario 3 / SC-004: an active, in-scope Grant still denies a
// transaction once the current time falls outside agreedDuration's validFrom/validUntil window.
describe("Transaction request denies an out-of-window Grant (User Story 2)", () => {
  it("denies a request made after validUntil has passed", async () => {
    const past = new Date(Date.now() - 3600_000);
    const { transactionService, grantNonce, challengeStore } = await seedGrantRecord({
      status: "active",
      agreedScope: { txTypes: ["transfer"], maxAmount: 500 },
      agreedDuration: {
        validFrom: new Date(past.getTime() - 3600_000).toISOString(),
        validUntil: past.toISOString(),
      },
    });

    const outcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });

    expect(outcome).toEqual({ ok: false, reason: "grant_out_of_window" });
    expect(challengeStore.sizeForTesting()).toBe(0);
  });

  it("denies a request made before validFrom", async () => {
    const future = new Date(Date.now() + 3600_000);
    const { transactionService, grantNonce, challengeStore } = await seedGrantRecord({
      status: "active",
      agreedScope: { txTypes: ["transfer"], maxAmount: 500 },
      agreedDuration: {
        validFrom: future.toISOString(),
        validUntil: new Date(future.getTime() + 3600_000).toISOString(),
      },
    });

    const outcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });

    expect(outcome).toEqual({ ok: false, reason: "grant_out_of_window" });
    expect(challengeStore.sizeForTesting()).toBe(0);
  });
});
