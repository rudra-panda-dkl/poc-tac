import { describe, it, expect } from "vitest";
import { GrantRecordStore } from "../../src/models/grant-record-store.js";
import { AgentKeyStore } from "../../src/models/agent-key-store.js";
import { TransactionChallengeStore } from "../../src/models/transaction-challenge-store.js";
import { TransactionService } from "../../src/services/transaction-service.js";

// spec.md Edge Cases: "What happens if the Agent requests a transaction referencing a Grant
// Record that was never issued (unknown/bogus grant reference)? The RP denies the request —
// this is not distinguished from any other 'not active' rejection."
describe("Transaction request denies an unknown grant reference (User Story 2, Edge Case)", () => {
  it("denies with the same reason as a not-active Grant, and issues no challenge", () => {
    const grantStore = new GrantRecordStore();
    const agentKeyStore = new AgentKeyStore();
    const challengeStore = new TransactionChallengeStore();
    const transactionService = new TransactionService(grantStore, agentKeyStore, challengeStore);

    const outcome = transactionService.request({
      grantNonce: "never-issued-grant-nonce",
      txType: "transfer",
      amount: 100,
    });

    expect(outcome).toEqual({ ok: false, reason: "grant_not_active" });
    expect(challengeStore.sizeForTesting()).toBe(0);
  });
});
