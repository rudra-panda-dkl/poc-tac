import { describe, it, expect } from "vitest";
import { TransactionChallengeStore } from "../../src/models/transaction-challenge-store.js";

function makeChallenge(challengeId: string) {
  const now = new Date();
  return {
    challengeId,
    challenge: "chal-" + challengeId,
    grantNonce: "grant-nonce",
    txType: "transfer",
    amount: 100,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    consumedAt: null,
  };
}

// FR-008/FR-009, Constitution Principle V (NON-NEGOTIABLE): retrieveForVerification() must be
// an atomic consume-at-retrieval — a second retrieval of the same challengeId always returns
// undefined, regardless of what the caller did with the first retrieval's result.
describe("TransactionChallengeStore.retrieveForVerification() atomicity", () => {
  it("returns the record on first retrieval and sets consumedAt", () => {
    const store = new TransactionChallengeStore();
    store.issue(makeChallenge("c1"));

    const record = store.retrieveForVerification("c1");
    expect(record).toBeDefined();
    expect(record?.consumedAt).not.toBeNull();
  });

  it("returns undefined on a second retrieval, regardless of the first attempt's downstream outcome", () => {
    const store = new TransactionChallengeStore();
    store.issue(makeChallenge("c2"));

    const first = store.retrieveForVerification("c2");
    expect(first).toBeDefined();

    const second = store.retrieveForVerification("c2");
    expect(second).toBeUndefined();
  });

  it("returns undefined for a challengeId that was never issued", () => {
    const store = new TransactionChallengeStore();
    expect(store.retrieveForVerification("never-issued")).toBeUndefined();
  });

  it("peekForTesting does not consume", () => {
    const store = new TransactionChallengeStore();
    store.issue(makeChallenge("c3"));

    store.peekForTesting("c3");
    store.peekForTesting("c3");

    const record = store.retrieveForVerification("c3");
    expect(record).toBeDefined();
  });
});
