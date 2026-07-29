import type { Credential } from "@tac/shared";
import { CredentialValidationService } from "../services/credential-validation-service.js";

// contracts/grant-api.yaml: /grant/activate only defines 200/409/422 — no 401 (that code is
// reserved for /grant/negotiate's assertion-verification failure).
const REASON_TO_STATUS: Record<string, number> = {
  nonce_not_found: 409,
  nonce_expired: 409,
  account_mismatch: 422,
  invalid_signature: 422,
  terms_mismatch: 422,
  assurance_mismatch: 422,
};

export function createActivateHandler(service: CredentialValidationService) {
  return async (body: Credential) => {
    const outcome = await service.activate(body);
    if (!outcome.ok) {
      return { status: REASON_TO_STATUS[outcome.reason] ?? 422, body: { error: outcome.reason } };
    }
    return { status: 200, body: { status: "active", grantNonce: body.integrity.grantNonce } };
  };
}
