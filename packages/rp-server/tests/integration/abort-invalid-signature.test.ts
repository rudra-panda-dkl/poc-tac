import { describe, it, expect } from "vitest";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
} from "./test-helpers.js";

// spec.md User Story 2, Scenario 2: a presented credential's signature fails validation ->
// abort, record stays `pending`.
describe("Abort on invalid signature (User Story 2)", () => {
  it("rejects a credential whose signature has been corrupted", async () => {
    const ctx = await setupTestRp();
    const requestedScope = { txTypes: ["transfer"] };
    const now = new Date();
    const requestedDuration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };
    const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, 0);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const agentPublicKeyJwk = await generateAgentPublicKeyJwk();
    const { credential } = await signTestCredential(
      ctx,
      agentPublicKeyJwk,
      {
        rpIdentifier: outcome.result.rpIdentifier,
        scope: outcome.result.agreedScope,
        temporal: outcome.result.agreedDuration,
        assuranceLevel: outcome.result.assuranceLevel,
        grantNonce: outcome.result.nonce,
      },
      newCounter,
    );

    // Flip one character of the base64url-encoded signature — must still be valid base64url
    // so we exercise "signature verification fails," not "malformed request."
    const corruptedSignature = flipOneChar(credential.integrity.userSignature.response.signature);
    const tampered = {
      ...credential,
      integrity: {
        ...credential.integrity,
        userSignature: {
          ...credential.integrity.userSignature,
          response: { ...credential.integrity.userSignature.response, signature: corruptedSignature },
        },
      },
    };

    const activation = await ctx.validationService.activate(tampered);
    expect(activation).toEqual({ ok: false, reason: "invalid_signature" });
    expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("pending");
  });
});

function flipOneChar(b64url: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const idx = Math.floor(b64url.length / 2);
  const current = b64url[idx];
  const replacement = chars[(chars.indexOf(current) + 1) % chars.length] ?? "A";
  return b64url.slice(0, idx) + replacement + b64url.slice(idx + 1);
}
