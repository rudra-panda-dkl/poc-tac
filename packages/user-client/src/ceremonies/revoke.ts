import { startAuthentication } from "@simplewebauthn/browser";

export interface RevokeParams {
  rpServerBaseUrl: string;
  grantNonce: string;
}

export interface RevokeResult {
  status: "revoked";
  grantNonce: string;
}

/** Revocation ceremony (FR-004): a single standard WebAuthn assertion, reusing ceremony one's
 * mechanism unchanged — no scope/duration content, so no second, locally-signed ceremony is
 * needed (specs/003-revoke/research.md §1). Same fetch-options → startAuthentication() → POST
 * shape as `ceremony-one.ts`'s `runCeremonyOne()` (research.md §6), per
 * contracts/revoke-api.yaml. */
export async function runRevocation(params: RevokeParams): Promise<RevokeResult> {
  const requestRes = await fetch(`${params.rpServerBaseUrl}/revoke/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grantNonce: params.grantNonce }),
  });
  if (!requestRes.ok) {
    const err = await requestRes.json().catch(() => ({}));
    throw new Error(`revoke/request failed: ${requestRes.status} ${JSON.stringify(err)}`);
  }
  const { challengeId, options } = await requestRes.json();

  const assertionResponse = await startAuthentication(options);

  const respondRes = await fetch(`${params.rpServerBaseUrl}/revoke/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, assertionResponse }),
  });
  if (!respondRes.ok) {
    const err = await respondRes.json().catch(() => ({}));
    throw new Error(`revoke/respond failed: ${respondRes.status} ${JSON.stringify(err)}`);
  }

  return (await respondRes.json()) as RevokeResult;
}
