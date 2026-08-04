import { describe, it, expect } from "vitest";
import { signTransactionResponse } from "@tac/agent-client/dist/transact/sign-transaction-response.js";
import { activateTestGrant } from "./transaction-test-helpers.js";

// FR-010 / Constitution Principle VI: the transaction-time challenge layer is distinct and
// independently verifiable from 001-grant's grant-nonce layer — redeeming a transaction
// challenge must not touch the Grant Record's own nonce-consumption state, and the two use
// entirely separate storage (`TransactionChallengeStore` vs. `GrantRecordStore`), keyed by
// unrelated identifiers (`challengeId` vs. grant `nonce`).
describe("Transaction challenge layer is independent from the grant-nonce layer (User Story 3)", () => {
  it("leaves the Grant Record's own consumedAt/status untouched by a transaction request/respond cycle", async () => {
    const now = new Date();
    const { ctx, transactionService, grantNonce, agentKeypair } = await activateTestGrant(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const beforeRecord = ctx.grantStore.get(grantNonce);
    const consumedAtAfterActivation = beforeRecord?.consumedAt;
    expect(consumedAtAfterActivation).not.toBeNull(); // consumed once, by 001-grant's own activation

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
    expect(respondOutcome.ok).toBe(true);

    const afterRecord = ctx.grantStore.get(grantNonce);
    expect(afterRecord?.consumedAt).toBe(consumedAtAfterActivation); // unchanged by the transaction flow
    expect(afterRecord?.status).toBe("active"); // unchanged
  });

  it("stores transaction challenges and Grant Records in separate, differently-keyed stores", async () => {
    const now = new Date();
    const { ctx, challengeStore, transactionService, grantNonce } = await activateTestGrant(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const requestOutcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    // The challenge's own key (challengeId) is unrelated to the grant nonce, and looking it up
    // in GrantRecordStore (by mistake) would find nothing — confirming these are genuinely
    // separate keyspaces, not a shared Map with prefixed keys.
    expect(requestOutcome.result.challengeId).not.toBe(grantNonce);
    expect(ctx.grantStore.get(requestOutcome.result.challengeId)).toBeUndefined();
    expect(challengeStore.peekForTesting(requestOutcome.result.challengeId)).toBeDefined();
  });
});
