import { TransactionService } from "../services/transaction-service.js";

export interface TransactRequestBody {
  grantNonce: string;
  txType: string;
  amount: number;
}

// contracts/transact-api.yaml: /transact/request only defines 200/403 — every Grant-state
// gate failure (not active, out of window, out of scope, or an unknown grant reference
// collapsed into "not active") is a 403, per spec.md Edge Cases and SC-001.
const REASON_TO_STATUS: Record<string, number> = {
  grant_not_active: 403,
  grant_out_of_window: 403,
  grant_out_of_scope: 403,
};

export function createTransactRequestHandler(service: TransactionService) {
  return (body: TransactRequestBody) => {
    const outcome = service.request(body);
    if (!outcome.ok) {
      return { status: REASON_TO_STATUS[outcome.reason] ?? 403, body: { error: outcome.reason } };
    }
    return { status: 200, body: outcome.result };
  };
}
