import {
  computeTransactionSignatureBytes,
  bufferToBase64url,
  type TransactionSignaturePayload,
} from "@tac/shared";
import type { AgentKeypair } from "../keypair/generate-keypair.js";

/** FR-006: the Agent proves live possession of its private key by signing the RP-issued
 * challenge plus the transaction's own request parameters — deliberately NOT a WebAuthn
 * ceremony; there is no human present at transaction time (Constitution Principle VI). Reuses
 * the Agent's existing per-RP keypair (`getOrCreateAgentKeypair`) unchanged from 001-grant; no
 * new key material is generated here (Constitution Principle VII). */
export async function signTransactionResponse(
  agentKeypair: AgentKeypair,
  payload: TransactionSignaturePayload,
): Promise<string> {
  const bytes = computeTransactionSignatureBytes(payload);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    agentKeypair.privateKey,
    bytes,
  );
  return bufferToBase64url(new Uint8Array(signature));
}
