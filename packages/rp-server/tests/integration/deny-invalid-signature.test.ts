import { describe, it, expect } from "vitest";
import { activateTestGrant } from "./transaction-test-helpers.js";

// spec.md User Story 2, Scenario 4 / Acceptance Scenario 2: a freshly-issued challenge presented
// with a missing or invalid signature is denied.
describe("Transaction respond denies an invalid signature (User Story 2)", () => {
  it("denies a garbage signature", async () => {
    const now = new Date();
    const { transactionService, grantNonce } = await activateTestGrant(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const requestOutcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const respondOutcome = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature: "not-a-real-signature",
    });

    expect(respondOutcome).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("denies an empty signature", async () => {
    const now = new Date();
    const { transactionService, grantNonce } = await activateTestGrant(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const requestOutcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const respondOutcome = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature: "",
    });

    expect(respondOutcome).toEqual({ ok: false, reason: "invalid_signature" });
  });
});
