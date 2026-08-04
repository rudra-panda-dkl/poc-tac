/** RP-issued, single-use revocation-time challenge (FR-003/FR-009) — see
 * specs/003-revoke/data-model.md "Entity: Revocation Challenge". Deliberately a separate
 * in-memory `Map`, keyed by `challengeId`, from both `GrantRecordStore`'s nonce map and
 * `TransactionChallengeStore`: FR-009 requires this layer be "distinct and independently
 * verifiable" from both existing layers and MUST NOT share storage or consumption logic with
 * either (Constitution Principle V — the third of three sibling single-use artifact types it
 * names: grant-time nonce, transaction-time challenge, revocation challenge). */
export interface RevocationChallenge {
  challengeId: string;
  /** The WebAuthn assertion ceremony's own `challenge` value (specs/003-revoke/research.md §1)
   * — not a separate artifact bridging two round-trips, since revocation is a single ceremony. */
  challenge: string;
  grantNonce: string;
  issuedAt: string;
  expiresAt: string;
  /** Set the instant the challenge is retrieved for verification (FR-007), before any other
   * check — independent of any other field, `consumedAt !== null` means "not redeemable again." */
  consumedAt: string | null;
}

/** `retrieveForVerification()` is the ONLY read path `RevocationService`'s respond flow may use
 * before running signature/Grant-state checks — it marks the challenge consumed at the moment of
 * retrieval, before the caller evaluates anything else (FR-007/FR-008, Constitution Principle V
 * — NON-NEGOTIABLE). This mirrors `GrantRecordStore`'s and `TransactionChallengeStore`'s
 * `retrieveForVerification()` shape deliberately: that consume-then-check ordering is the
 * mechanism Principle V requires, and both prior stores needed exactly this fix at least once
 * (see specs/001-grant/quickstart.md's Scenario 3 note) — reusing the proven-correct shape here
 * avoids reintroducing that same bug in a third, independent implementation. */
export class RevocationChallengeStore {
  private readonly challenges = new Map<string, RevocationChallenge>();

  issue(challenge: RevocationChallenge): RevocationChallenge {
    this.challenges.set(challenge.challengeId, challenge);
    return challenge;
  }

  /** Atomic retrieve-and-consume. A challenge may be successfully retrieved AT MOST ONCE: if
   * `consumedAt` is already set — whether that first retrieval's downstream checks passed or
   * failed — this returns `undefined`, exactly as if the challenge didn't exist (FR-008). Only
   * on a genuinely first retrieval does this set `consumedAt` and return the record, and it does
   * so before the caller evaluates any other check (FR-007). */
  retrieveForVerification(challengeId: string): RevocationChallenge | undefined {
    const record = this.challenges.get(challengeId);
    if (!record) return undefined;
    if (record.consumedAt !== null) return undefined;
    record.consumedAt = new Date().toISOString();
    return record;
  }

  /** Test-only accessor — does NOT consume. Never call this from `RevocationService` or any
   * production code path. */
  peekForTesting(challengeId: string): RevocationChallenge | undefined {
    return this.challenges.get(challengeId);
  }

  sizeForTesting(): number {
    return this.challenges.size;
  }
}
