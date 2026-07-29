import { buildAuthenticationOptions } from "../services/webauthn.js";
import type { PendingChallengeStore } from "../models/pending-challenge-store.js";

export function createAuthenticateOptionsHandler(pendingChallenges: PendingChallengeStore) {
  return async (query: Record<string, string>) => {
    const accountId = query.accountId ?? "demo-user";
    const options = await buildAuthenticationOptions();
    pendingChallenges.set(accountId, options.challenge);
    return { status: 200, body: options };
  };
}
