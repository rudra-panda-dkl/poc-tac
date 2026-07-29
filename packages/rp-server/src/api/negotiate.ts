import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import type { CredentialScope } from "@tac/shared";
import { NegotiationService } from "../services/negotiation-service.js";
import type { PendingChallengeStore } from "../models/pending-challenge-store.js";

export interface NegotiateRequestBody {
  accountId: string;
  assertionResponse: AuthenticationResponseJSON;
  requestedScope: CredentialScope;
  requestedDuration: { validFrom: string; validUntil: string };
}

const REASON_TO_STATUS: Record<string, number> = {
  account_not_found: 401,
  invalid_assertion: 401,
  exceeds_ceiling: 400,
};

export function createNegotiateHandler(
  negotiationService: NegotiationService,
  pendingChallenges: PendingChallengeStore,
) {
  return async (body: NegotiateRequestBody) => {
    const expectedChallenge = pendingChallenges.take(body.accountId);
    if (!expectedChallenge) {
      return { status: 401, body: { error: "no_pending_challenge" } };
    }
    const outcome = await negotiationService.negotiate({
      accountId: body.accountId,
      assertionResponse: body.assertionResponse,
      expectedChallenge,
      requestedScope: body.requestedScope,
      requestedDuration: body.requestedDuration,
    });
    if (!outcome.ok) {
      return { status: REASON_TO_STATUS[outcome.reason] ?? 400, body: { error: outcome.reason } };
    }
    return { status: 200, body: outcome.result };
  };
}
