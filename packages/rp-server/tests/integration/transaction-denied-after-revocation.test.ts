import { describe, it, expect } from "vitest";
import {
  activateSingleGrantWithRevocation,
  signRevocationChallenge,
  buildTransactionServiceOnContext,
} from "./revocation-test-helpers.js";

// spec.md User Story 1, Acceptance Scenario 2 (SC-002): immediately after a successful
// revocation, a transaction request against the same Grant is denied — via 002-transact's
// EXISTING Grant-state gate, with no new code in transaction-service.ts (FR-012).
describe("Transaction denied immediately after revocation (User Story 1)", () => {
  it("denies a transact/request call made right after the Grant is revoked", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );
    const { transactionService } = buildTransactionServiceOnContext(ctx);

    const requestOutcome = await revocationService.request({ grantNonce });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;
    const assertionResponse = await signRevocationChallenge(ctx, requestOutcome.result.options.challenge);
    const revokeOutcome = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse,
    });
    expect(revokeOutcome.ok).toBe(true);

    const txOutcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });

    expect(txOutcome).toEqual({ ok: false, reason: "grant_not_active" });
  });
});
