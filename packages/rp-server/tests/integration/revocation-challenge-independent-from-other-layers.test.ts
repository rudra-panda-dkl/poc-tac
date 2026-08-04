import { describe, it, expect } from "vitest";
import {
  activateSingleGrantWithRevocation,
  signRevocationChallenge,
  buildTransactionServiceOnContext,
} from "./revocation-test-helpers.js";

// FR-009 / Constitution Principle V: the revocation-challenge layer is distinct and
// independently verifiable from BOTH 001-grant's grant-nonce layer AND 002-transact's
// transaction-challenge layer — redeeming a revocation challenge must not touch either.
describe("Revocation challenge layer is independent from the other two single-use layers (User Story 3)", () => {
  it("leaves the Grant Record's own grant-time consumedAt untouched by a revocation", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const consumedAtAfterActivation = ctx.grantStore.get(grantNonce)?.consumedAt;
    expect(consumedAtAfterActivation).not.toBeNull(); // consumed once, by 001-grant's own activation

    const requestOutcome = await revocationService.request({ grantNonce });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;
    const assertionResponse = await signRevocationChallenge(ctx, requestOutcome.result.options.challenge);
    const respondOutcome = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse,
    });
    expect(respondOutcome.ok).toBe(true);

    expect(ctx.grantStore.get(grantNonce)?.consumedAt).toBe(consumedAtAfterActivation); // unchanged
  });

  it("leaves an already-issued transaction challenge untouched by a revocation", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );
    const { transactionService, transactionChallengeStore } = buildTransactionServiceOnContext(ctx);

    const txRequestOutcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });
    expect(txRequestOutcome.ok).toBe(true);
    if (!txRequestOutcome.ok) return;
    const txChallengeBefore = transactionChallengeStore.peekForTesting(txRequestOutcome.result.challengeId);
    expect(txChallengeBefore?.consumedAt).toBeNull();

    const requestOutcome = await revocationService.request({ grantNonce });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;
    const assertionResponse = await signRevocationChallenge(ctx, requestOutcome.result.options.challenge);
    await revocationService.respond({ challengeId: requestOutcome.result.challengeId, assertionResponse });

    // The transaction challenge itself is untouched — still unconsumed at the store level, even
    // though a subsequent transact/respond against it would now be denied by the Grant-state
    // re-check (a separate, already-tested behavior — this test is about storage independence).
    const txChallengeAfter = transactionChallengeStore.peekForTesting(txRequestOutcome.result.challengeId);
    expect(txChallengeAfter?.consumedAt).toBeNull();
  });

  it("stores revocation challenges and transaction challenges in separate, differently-keyed stores", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );
    const { transactionService, transactionChallengeStore } = buildTransactionServiceOnContext(ctx);

    const txRequestOutcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });
    expect(txRequestOutcome.ok).toBe(true);
    if (!txRequestOutcome.ok) return;

    const revokeRequestOutcome = await revocationService.request({ grantNonce });
    expect(revokeRequestOutcome.ok).toBe(true);
    if (!revokeRequestOutcome.ok) return;

    expect(revokeRequestOutcome.result.challengeId).not.toBe(txRequestOutcome.result.challengeId);
    expect(transactionChallengeStore.peekForTesting(revokeRequestOutcome.result.challengeId)).toBeUndefined();
  });
});
