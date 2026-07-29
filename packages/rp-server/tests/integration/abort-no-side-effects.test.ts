import { describe, it, expect } from "vitest";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
} from "./test-helpers.js";

// spec.md User Story 2, Scenario 5 (SC-003): across all failure categories, the RP creates no
// additional Grant Record and does not transition any record to `active` as a side effect.
describe("No side effects on any abort category (User Story 2)", () => {
  it("account mismatch, invalid signature, nonce mismatch, and terms mismatch all leave exactly one pending record and nothing activated", async () => {
    const ctx = await setupTestRp();
    const requestedScope = { txTypes: ["transfer"] };
    const now = new Date();
    const requestedDuration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };
    const agentPublicKeyJwk = await generateAgentPublicKeyJwk();

    let counter = 0;

    // 1. Account mismatch
    {
      const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, counter);
      counter = newCounter;
      if (!outcome.ok) throw new Error("setup failure");
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
        counter,
      );
      const tampered = {
        ...credential,
        identity: { ...credential.identity, userPublicKey: { kty: "EC", crv: "P-256", x: "bogus", y: "bogus" } },
      };
      const before = ctx.grantStore.sizeForTesting();
      const activation = await ctx.validationService.activate(tampered);
      expect(activation.ok).toBe(false);
      expect(ctx.grantStore.sizeForTesting()).toBe(before); // no new record created
      expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("pending");
    }

    // 2. Invalid signature
    {
      const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, counter);
      counter = newCounter;
      if (!outcome.ok) throw new Error("setup failure");
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
        counter,
      );
      const tampered = {
        ...credential,
        integrity: {
          ...credential.integrity,
          userSignature: {
            ...credential.integrity.userSignature,
            response: { ...credential.integrity.userSignature.response, signature: "AAAAAAAAAAAAAAAAAAAA" },
          },
        },
      };
      const before = ctx.grantStore.sizeForTesting();
      const activation = await ctx.validationService.activate(tampered);
      expect(activation.ok).toBe(false);
      expect(ctx.grantStore.sizeForTesting()).toBe(before);
      expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("pending");
    }

    // 3. Nonce mismatch (never-issued nonce)
    {
      const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, counter);
      counter = newCounter;
      if (!outcome.ok) throw new Error("setup failure");
      const { credential } = await signTestCredential(
        ctx,
        agentPublicKeyJwk,
        {
          rpIdentifier: outcome.result.rpIdentifier,
          scope: outcome.result.agreedScope,
          temporal: outcome.result.agreedDuration,
          assuranceLevel: outcome.result.assuranceLevel,
          grantNonce: "99999999-9999-9999-9999-999999999999",
        },
        counter,
      );
      const before = ctx.grantStore.sizeForTesting();
      const activation = await ctx.validationService.activate(credential);
      expect(activation).toEqual({ ok: false, reason: "nonce_not_found" });
      expect(ctx.grantStore.sizeForTesting()).toBe(before);
      expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("pending");
    }

    // 4. Terms mismatch
    {
      const { outcome, newCounter } = await performCeremonyOne(ctx, requestedScope, requestedDuration, counter);
      counter = newCounter;
      if (!outcome.ok) throw new Error("setup failure");
      const { credential } = await signTestCredential(
        ctx,
        agentPublicKeyJwk,
        {
          rpIdentifier: outcome.result.rpIdentifier,
          scope: { txTypes: ["transfer"], maxAmount: 999_999 },
          temporal: outcome.result.agreedDuration,
          assuranceLevel: outcome.result.assuranceLevel,
          grantNonce: outcome.result.nonce,
        },
        counter,
      );
      const before = ctx.grantStore.sizeForTesting();
      const activation = await ctx.validationService.activate(credential);
      expect(activation).toEqual({ ok: false, reason: "terms_mismatch" });
      expect(ctx.grantStore.sizeForTesting()).toBe(before);
      expect(ctx.grantStore.peekForTesting(outcome.result.nonce)?.status).toBe("pending");
    }
  });
});
