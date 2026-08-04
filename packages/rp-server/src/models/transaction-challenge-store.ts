/** RP-issued, single-use transaction-time challenge (FR-005/FR-010) — see
 * specs/002-transact/data-model.md "Entity: Transaction Challenge". Deliberately a separate
 * in-memory `Map`, keyed by `challengeId`, from `GrantRecordStore`'s nonce map: FR-010 requires
 * this layer be "distinct and independently verifiable" from 001-grant's grant-nonce layer and
 * MUST NOT share storage or consumption logic with it (Constitution Principle VI). */
export interface TransactionChallenge {
  challengeId: string;
  challenge: string;
  grantNonce: string;
  txType: string;
  amount: number;
  issuedAt: string;
  expiresAt: string;
  /** Set the instant the challenge is retrieved for verification (FR-008), before any other
   * check — independent of any other field, `consumedAt !== null` means "not redeemable again." */
  consumedAt: string | null;
}

/** `retrieveForVerification()` is the ONLY read path `TransactionService`'s respond flow may use
 * before running signature/Grant-state checks — it marks the challenge consumed at the moment of
 * retrieval, before the caller evaluates anything else (FR-008/FR-009, Constitution Principle V
 * — NON-NEGOTIABLE). This mirrors `GrantRecordStore.retrieveForVerification()`'s exact shape from
 * 001-grant deliberately: that method's consume-then-check ordering is the mechanism Principle V
 * requires, and 001-grant's own quickstart.md records that consuming on success only (instead of
 * on retrieval) was a real bug caught there — reusing the proven-correct shape here avoids
 * reintroducing it in this second, independent implementation. */
export class TransactionChallengeStore {
  private readonly challenges = new Map<string, TransactionChallenge>();

  issue(challenge: TransactionChallenge): TransactionChallenge {
    this.challenges.set(challenge.challengeId, challenge);
    return challenge;
  }

  /** Atomic retrieve-and-consume. A challenge may be successfully retrieved AT MOST ONCE: if
   * `consumedAt` is already set — whether that first retrieval's downstream checks passed or
   * failed — this returns `undefined`, exactly as if the challenge didn't exist (FR-009). Only on
   * a genuinely first retrieval does this set `consumedAt` and return the record, and it does so
   * before the caller evaluates any other check (FR-008). */
  retrieveForVerification(challengeId: string): TransactionChallenge | undefined {
    const record = this.challenges.get(challengeId);
    if (!record) return undefined;
    if (record.consumedAt !== null) return undefined;
    record.consumedAt = new Date().toISOString();
    return record;
  }

  /** Test-only accessor — does NOT consume. Never call this from `TransactionService` or any
   * production code path. */
  peekForTesting(challengeId: string): TransactionChallenge | undefined {
    return this.challenges.get(challengeId);
  }

  sizeForTesting(): number {
    return this.challenges.size;
  }
}
