import { describe, it, expect } from "vitest";
import { signTransactionResponse } from "@tac/agent-client/dist/transact/sign-transaction-response.js";
import { activateTestGrant } from "./transaction-test-helpers.js";

// spec.md User Story 3, Scenario 2: a challenge first presented with an invalid signature, then
// retried with a corrected, validly-signed response under the SAME challengeId, is still
// rejected — because consumedAt was set at first retrieval (FR-008), not at first success.
describe("Transaction challenge replay after a failed attempt is still rejected (User Story 3)", () => {
  it("rejects a corrected retry under the same challengeId that first failed signature verification", async () => {
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

    const firstAttempt = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature: "not-a-real-signature",
    });
    expect(firstAttempt).toEqual({ ok: false, reason: "invalid_signature" });

    const correctedSignature = await signTransactionResponse(agentKeypair, {
      challenge: requestOutcome.result.challenge,
      txType,
      amount,
    });
    const retry = await transactionService.respond({
      challengeId: requestOutcome.result.challengeId,
      signature: correctedSignature,
    });

    expect(retry).toEqual({ ok: false, reason: "challenge_not_found" });
  });
});
