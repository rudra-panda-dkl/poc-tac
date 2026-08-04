import { TransactionService } from "../services/transaction-service.js";

export interface TransactRespondBody {
  challengeId: string;
  signature: string;
}

// contracts/transact-api.yaml: 409 for challenge conflict/expiry (FR-009, mirrors 001-grant's
// nonce_not_found/nonce_expired), 403 for the respond-time Grant-state re-check (research.md
// §5), 422 for signature failure.
const REASON_TO_STATUS: Record<string, number> = {
  challenge_not_found: 409,
  challenge_expired: 409,
  grant_not_active: 403,
  grant_out_of_window: 403,
  invalid_signature: 422,
};

export function createTransactRespondHandler(service: TransactionService) {
  return async (body: TransactRespondBody) => {
    const outcome = await service.respond(body);
    if (!outcome.ok) {
      return { status: REASON_TO_STATUS[outcome.reason] ?? 422, body: { error: outcome.reason } };
    }
    return {
      status: 200,
      body: { status: "permitted", grantNonce: outcome.grantNonce, challengeId: outcome.challengeId },
    };
  };
}
