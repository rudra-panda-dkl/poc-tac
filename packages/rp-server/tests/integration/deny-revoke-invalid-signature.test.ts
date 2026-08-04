import { describe, it, expect } from "vitest";
import { activateSingleGrantWithRevocation, signRevocationChallenge } from "./revocation-test-helpers.js";

// spec.md User Story 2, Acceptance Scenario 3 / SC-004: a freshly-issued revocation challenge
// presented with a corrupted signature is denied.
describe("Revocation respond denies an invalid signature (User Story 2)", () => {
  it("rejects a signature that has been corrupted by one character", async () => {
    const now = new Date();
    const { ctx, revocationService, grantNonce } = await activateSingleGrantWithRevocation(
      { txTypes: ["transfer"], maxAmount: 500 },
      { validFrom: now.toISOString(), validUntil: new Date(now.getTime() + 3600_000).toISOString() },
    );

    const requestOutcome = await revocationService.request({ grantNonce });
    expect(requestOutcome.ok).toBe(true);
    if (!requestOutcome.ok) return;

    const assertionResponse = await signRevocationChallenge(ctx, requestOutcome.result.options.challenge);
    // Flip one character of the base64url-encoded signature — must still be valid base64url so
    // we exercise "signature verification fails," not "malformed request" (mirrors
    // abort-invalid-signature.test.ts's established pattern).
    const corrupted = {
      ...assertionResponse,
      response: {
        ...assertionResponse.response,
        signature: flipOneChar(assertionResponse.response.signature),
      },
    };

    const outcome = await revocationService.respond({
      challengeId: requestOutcome.result.challengeId,
      assertionResponse: corrupted,
    });

    expect(outcome).toEqual({ ok: false, reason: "invalid_signature" });
  });
});

function flipOneChar(b64url: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const idx = Math.floor(b64url.length / 2);
  const current = b64url[idx];
  const replacement = chars[(chars.indexOf(current) + 1) % chars.length] ?? "A";
  return b64url.slice(0, idx) + replacement + b64url.slice(idx + 1);
}
