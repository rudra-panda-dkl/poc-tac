export interface AgentKeypair {
  rpIdentifier: string;
  publicKeyJwk: JsonWebKey;
  /** Never serialized, exported as a raw key, or transmitted anywhere — stays a non-extractable
   * `CryptoKey` handle in this process's memory for the lifetime of the Agent client (FR-017,
   * Constitution Principle VII). Only `publicKeyJwk` ever leaves this module. */
  privateKey: CryptoKey;
}

const keypairsByRp = new Map<string, AgentKeypair>();

/** FR-017/FR-018 (resolves OQ-4): one Agent keypair per RP, generated locally, never custodied
 * by the User or RP. Takes ONLY `rpIdentifier` — no scope or duration parameter exists on this
 * signature, because the Agent must not learn negotiated terms before the signed credential is
 * delivered (FR-018a, resolves OQ-3). Idempotent per RP: calling this twice for the same
 * `rpIdentifier` returns the same keypair rather than rotating it. */
export async function getOrCreateAgentKeypair(rpIdentifier: string): Promise<AgentKeypair> {
  const existing = keypairsByRp.get(rpIdentifier);
  if (existing) return existing;

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false, // private key non-extractable — cannot be exported even by this process's own code
    ["sign"],
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  const agentKeypair: AgentKeypair = { rpIdentifier, publicKeyJwk, privateKey: keyPair.privateKey };
  keypairsByRp.set(rpIdentifier, agentKeypair);
  return agentKeypair;
}
