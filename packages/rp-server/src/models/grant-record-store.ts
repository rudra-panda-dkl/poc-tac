import type { GrantRecord } from "@tac/shared";

/** In-memory Grant Record store, keyed by grant nonce (research.md §6 — single-RP-instance
 * POC scale, no external database). `retrieveForVerification()` is the ONLY read path
 * credential-validation-service.ts may use before running signature/terms/account checks —
 * it marks the record consumed at the moment of retrieval, before the caller evaluates
 * anything else (FR-014/FR-015, Constitution Principle V — NON-NEGOTIABLE). Consuming on
 * success only would leave a failed attempt's nonce redeemable a second time within its
 * validity window, which is exactly the replay window Principle V exists to close. */
export class GrantRecordStore {
  private readonly records = new Map<string, GrantRecord>();

  createPending(record: GrantRecord): GrantRecord {
    this.records.set(record.nonce, record);
    return record;
  }

  /** Atomic retrieve-and-consume. A nonce may be successfully retrieved AT MOST ONCE: if
   * `consumedAt` is already set — whether that first retrieval's downstream checks passed or
   * failed — this returns `undefined`, exactly as if the nonce didn't exist (FR-015: "reject
   * any subsequent presentation... regardless of whether the presentation that consumed it
   * succeeded or failed downstream"). Only on a genuinely first retrieval does this set
   * `consumedAt` and return the record, and it does so before the caller evaluates any other
   * check (FR-014). Without this, a nonce whose first attempt failed a downstream check (or
   * even succeeded) would stay silently re-readable here, leaving replay rejection to depend
   * entirely on incidental checks elsewhere (e.g. WebAuthn's own signature-counter monotonicity)
   * rather than the grant-nonce layer this feature is responsible for (FR-016). */
  retrieveForVerification(nonce: string): GrantRecord | undefined {
    const record = this.records.get(nonce);
    if (!record) return undefined;
    if (record.consumedAt !== null) return undefined;
    record.consumedAt = new Date().toISOString();
    return record;
  }

  transitionToActive(nonce: string): void {
    const record = this.records.get(nonce);
    if (record) record.status = "active";
  }

  transitionToExpired(nonce: string): void {
    const record = this.records.get(nonce);
    if (record) record.status = "expired";
  }

  /** Test-only accessor — does NOT consume. Never call this from
   * credential-validation-service.ts or any production code path. */
  peekForTesting(nonce: string): GrantRecord | undefined {
    return this.records.get(nonce);
  }

  sizeForTesting(): number {
    return this.records.size;
  }
}
