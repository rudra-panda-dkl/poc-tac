import { describe, it, expect } from "vitest";
import {
  activateSingleGrantWithRevocation,
  signRevocationChallenge,
  buildTransactionServiceOnContext,
} from "./revocation-test-helpers.js";

// spec.md User Story 1, Acceptance Scenario 3: a transaction challenge issued BEFORE revocation
// but responded to AFTER revocation completes is denied — this is the specific case
// research.md §5's "zero new code in transaction-service.ts" claim depends on. The denial
// reason MUST be "grant_not_active" (from the respond-time Grant-state re-check), not
// "invalid_signature" — proving the existing re-check catches this before signature
// verification even runs, so a garbage signature is sufficient to prove the point.
describe("Transaction denied for a challenge issued before, but responded to after, revocation (User Story 1)", () => {
  it("denies via the respond-time Grant-state re-check, not signature verification", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );
    const { transactionService } = buildTransactionServiceOnContext(ctx);

    // Transaction challenge issued while the Grant is still active.
    const txRequestOutcome = transactionService.request({ grantNonce, txType: "transfer", amount: 100 });
    expect(txRequestOutcome.ok).toBe(true);
    if (!txRequestOutcome.ok) return;

    // Revocation completes in between.
    const revokeRequestOutcome = await revocationService.request({ grantNonce });
    expect(revokeRequestOutcome.ok).toBe(true);
    if (!revokeRequestOutcome.ok) return;
    const assertionResponse = await signRevocationChallenge(ctx, revokeRequestOutcome.result.options.challenge);
    const revokeOutcome = await revocationService.respond({
      challengeId: revokeRequestOutcome.result.challengeId,
      assertionResponse,
    });
    expect(revokeOutcome.ok).toBe(true);

    // The Agent, unaware, responds to its already-issued transaction challenge.
    const txRespondOutcome = await transactionService.respond({
      challengeId: txRequestOutcome.result.challengeId,
      signature: "irrelevant-garbage-signature",
    });

    expect(txRespondOutcome).toEqual({ ok: false, reason: "grant_not_active" });
  });
});
