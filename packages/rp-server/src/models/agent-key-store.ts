/** RP-owned, in-memory record of the Agent public key bound to each activated Grant (research.md
 * §1, data-model.md "Entity: Agent Key Record"). NOT a field on `GrantRecord` or `Credential` —
 * both entities are read-only, not-redefined by this feature (spec.md Key Entities). Populated
 * exactly once, by `CredentialValidationService.activate()`'s success path in 001-grant's
 * existing code (the one place this feature's implementation touches 001-grant), closing the gap
 * where `Credential.identity.agentPublicKey` would otherwise be unreachable after activation —
 * the `Credential` itself is never persisted. */
export class AgentKeyStore {
  private readonly keysByGrantNonce = new Map<string, JsonWebKey>();

  record(grantNonce: string, agentPublicKey: JsonWebKey): void {
    this.keysByGrantNonce.set(grantNonce, agentPublicKey);
  }

  get(grantNonce: string): JsonWebKey | undefined {
    return this.keysByGrantNonce.get(grantNonce);
  }
}
