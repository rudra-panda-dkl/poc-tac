/** Bridges ceremony one's two HTTP round-trips (fetch options, then verify the assertion) —
 * the challenge issued by `GET /grant/authenticate/options` must be recalled when
 * `POST /grant/negotiate` verifies the assertion against it. In-memory, POC-scale (research.md
 * §6), same lifetime rationale as GrantRecordStore. Not a `pending` Grant Record itself — this
 * exists strictly before a Grant Record is created. */
export class PendingChallengeStore {
  private readonly challenges = new Map<string, string>();

  set(accountId: string, challenge: string): void {
    this.challenges.set(accountId, challenge);
  }

  /** Single-use: retrieving a pending challenge removes it. */
  take(accountId: string): string | undefined {
    const challenge = this.challenges.get(accountId);
    this.challenges.delete(accountId);
    return challenge;
  }
}
