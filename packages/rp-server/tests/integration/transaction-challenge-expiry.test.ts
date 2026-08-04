import { describe, it, expect } from "vitest";
import { signTransactionResponse } from "@tac/agent-client/dist/transact/sign-transaction-response.js";
import { activateTestGrant } from "./transaction-test-helpers.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// spec.md Assumptions (short-lived challenge window) + data-model.md validation rules: a
// challenge presented after its own expiresAt has elapsed is rejected, mirroring 001-grant's
// nonce_expired handling — even with an otherwise-valid signature.
describe("Transaction challenge expiry rejects even a validly-signed response (User Story 3)", () => {
  it("rejects once the challenge window has elapsed", async () => {
    const now = new Date();
    const challengeWindowSeconds = 0.1; // 100ms — short window for a fast test
    const { transactionService, grantNonce, agentKeypair } = await activateTestGrant(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
      challengeWindowSeconds,
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

    await sleep(250); // well past the 100ms challenge window

    const respondOutcome = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature,
    });

    expect(respondOutcome).toEqual({ ok: false, reason: "challenge_expired" });
  });
});
