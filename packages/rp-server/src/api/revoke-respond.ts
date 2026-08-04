import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { RevocationService } from "../services/revocation-service.js";

export interface RevokeRespondBody {
  challengeId: string;
  assertionResponse: AuthenticationResponseJSON;
}

// contracts/revoke-api.yaml: 409 for challenge conflict/expiry (FR-008, mirrors 002-transact's
// challenge_not_found/challenge_expired), 403 for the respond-time Grant-state re-check
// (mirrors research.md §5's precedent there), 422 for signature failure.
const REASON_TO_STATUS: Record<string, number> = {
  challenge_not_found: 409,
  challenge_expired: 409,
  grant_not_active: 403,
  invalid_signature: 422,
};

export function createRevokeRespondHandler(service: RevocationService) {
  return async (body: RevokeRespondBody) => {
    const outcome = await service.respond(body);
    if (!outcome.ok) {
      return { status: REASON_TO_STATUS[outcome.reason] ?? 422, body: { error: outcome.reason } };
    }
    return { status: 200, body: { status: "revoked", grantNonce: outcome.grantNonce } };
  };
}
