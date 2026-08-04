import { describe, it, expect } from "vitest";
import { signTransactionResponse } from "@tac/agent-client/dist/transact/sign-transaction-response.js";
import { activateTestGrant } from "./transaction-test-helpers.js";

// spec.md User Story 1 Independent Test: seed an active Grant Record, request a transaction
// within its scope and window, complete the challenge-response with the Agent's private key,
// confirm the RP returns a permit decision (SC-002/SC-006).
describe("Full transaction flow (User Story 1)", () => {
  it("permits an in-scope, in-window transaction signed with the Agent's real private key", async () => {
    const now = new Date();
    const duration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };
    const { transactionService, grantNonce, agentKeypair } = await activateTestGrant(
      { txTypes: ["transfer"], maxAmount: 500 },
      duration,
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

    const respondOutcome = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature,
    });

    expect(respondOutcome).toEqual({
      ok: true,
      grantNonce,
      challengeId: requestOutcome.result.challengeId,
    });
  });
});
