import { RevocationService } from "../services/revocation-service.js";

export interface RevokeRequestBody {
  grantNonce: string;
}

// contracts/revoke-api.yaml: /revoke/request only defines 200/403 — every Grant-state gate
// failure (not active, or an unknown grant reference collapsed into "not active") is a 403,
// per spec.md Edge Cases and SC-003.
const REASON_TO_STATUS: Record<string, number> = {
  grant_not_active: 403,
};

export function createRevokeRequestHandler(service: RevocationService) {
  return async (body: RevokeRequestBody) => {
    const outcome = await service.request(body);
    if (!outcome.ok) {
      return { status: REASON_TO_STATUS[outcome.reason] ?? 403, body: { error: outcome.reason } };
    }
    return { status: 200, body: outcome.result };
  };
}
