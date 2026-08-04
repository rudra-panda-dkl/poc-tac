import { describe, it, expect } from "vitest";
import { signTransactionResponse } from "@tac/agent-client/dist/transact/sign-transaction-response.js";
import { activateTestGrant } from "./transaction-test-helpers.js";

// spec.md User Story 3, Scenario 1 / SC-005: a challenge that has already been successfully
// redeemed is rejected on a second presentation.
describe("Transaction challenge replay after success is rejected (User Story 3)", () => {
  it("rejects a second presentation of an already-permitted challengeId", async () => {
    const now = new Date();
    const { transactionService, grantNonce, agentKeypair } = await activateTestGrant(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const txType = "transfer";
    const amount = 100;
    const requestOutcome = transactionService.request({ grantNonce, txType, amount });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const signature = await signTransactionResponse(agentKeypair, {
      challenge: requestOutcome.result.challenge,
      txType,
      amount,
    });

    const first = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature,
    });
    expect(first.ok).toBe(true);

    const replay = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature,
    });
    expect(replay).toEqual({ ok: false, reason: "challenge_not_found" });
  });
});
