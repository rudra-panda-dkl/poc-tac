import { startAuthentication } from "@simplewebauthn/browser";
import type { AssuranceLevel, CredentialScope } from "@tac/shared";

export interface CeremonyOneParams {
  rpServerBaseUrl: string;
  accountId: string;
  requestedScope: CredentialScope;
  requestedDuration: { validFrom: string; validUntil: string };
}

export interface CeremonyOneResult {
  accountId: string;
  nonce: string;
  agreedScope: CredentialScope;
  agreedDuration: { validFrom: string; validUntil: string };
  assuranceLevel: AssuranceLevel;
  rpIdentifier: string;
  nonceExpiresAt: string;
}

/** Ceremony one (FR-003): fetch a server-issued challenge, authenticate, and negotiate
 * scope/duration — per contracts/grant-api.yaml `/grant/authenticate/options` +
 * `/grant/negotiate`. */
export async function runCeremonyOne(params: CeremonyOneParams): Promise<CeremonyOneResult> {
  const optionsRes = await fetch(
    `${params.rpServerBaseUrl}/grant/authenticate/options?accountId=${encodeURIComponent(params.accountId)}`,
  );
  if (!optionsRes.ok) {
    throw new Error(`authenticate/options failed: ${optionsRes.status}`);
  }
  const options = await optionsRes.json();

  const assertionResponse = await startAuthentication(options);

  const negotiateRes = await fetch(`${params.rpServerBaseUrl}/grant/negotiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountId: params.accountId,
      assertionResponse,
      requestedScope: params.requestedScope,
      requestedDuration: params.requestedDuration,
    }),
  });
  if (!negotiateRes.ok) {
    const err = await negotiateRes.json().catch(() => ({}));
    throw new Error(`negotiate failed: ${negotiateRes.status} ${JSON.stringify(err)}`);
  }

  const result = (await negotiateRes.json()) as Omit<CeremonyOneResult, "accountId">;
  return { accountId: params.accountId, ...result };
}
