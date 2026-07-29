import type { AuthenticatorDevice } from "@simplewebauthn/types";

interface RegisteredEntry {
  authenticator: AuthenticatorDevice;
  /** Kept alongside the COSE-encoded `authenticator.credentialPublicKey` so the RP can do a
   * quick binding check ("does this credential's identity.userPublicKey match the account
   * ceremony one authenticated as?", FR-009-adjacent) without writing a COSE→JWK decoder —
   * the real cryptographic guarantee is @simplewebauthn/server's assertion signature
   * verification against `credentialPublicKey`, not this comparison. */
  userPublicKeyJwk: JsonWebKey;
}

/** In-memory store for the User's registered passkey (spec.md precondition — registration
 * itself is out of this feature's scope). Keyed by an RP-local account identifier. */
export class RegisteredPasskeyStore {
  private readonly byAccountId = new Map<string, RegisteredEntry>();
  private readonly byCredentialId = new Map<string, string>(); // credentialID -> accountId

  register(accountId: string, authenticator: AuthenticatorDevice, userPublicKeyJwk: JsonWebKey): void {
    this.byAccountId.set(accountId, { authenticator, userPublicKeyJwk });
    this.byCredentialId.set(authenticator.credentialID, accountId);
  }

  getByAccountId(accountId: string): AuthenticatorDevice | undefined {
    return this.byAccountId.get(accountId)?.authenticator;
  }

  getPublicKeyJwkByAccountId(accountId: string): JsonWebKey | undefined {
    return this.byAccountId.get(accountId)?.userPublicKeyJwk;
  }

  /** Used at activation (FR-009 path): looks up the RP's own registration record for the
   * account implied by a presented credential's User public key / credential ID. */
  getByCredentialId(
    credentialId: string,
  ): { accountId: string; authenticator: AuthenticatorDevice; userPublicKeyJwk: JsonWebKey } | undefined {
    const accountId = this.byCredentialId.get(credentialId);
    if (!accountId) return undefined;
    const entry = this.byAccountId.get(accountId);
    if (!entry) return undefined;
    return { accountId, authenticator: entry.authenticator, userPublicKeyJwk: entry.userPublicKeyJwk };
  }

  updateCounter(credentialId: string, newCounter: number): void {
    const accountId = this.byCredentialId.get(credentialId);
    const entry = accountId ? this.byAccountId.get(accountId) : undefined;
    if (entry) entry.authenticator.counter = newCounter;
  }
}
