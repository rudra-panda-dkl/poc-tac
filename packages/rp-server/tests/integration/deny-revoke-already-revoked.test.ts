import { describe, it, expect } from "vitest";
import { seedRevocationTestGrant } from "./revocation-test-helpers.js";

// spec.md User Story 2, Scenario 1 / SC-003: a Grant Record already `revoked` denies a second
// revocation request with no challenge issued, and its status remains `revoked`.
describe("Revocation request denies an already-revoked Grant (User Story 2)", () => {
  it("denies with no challenge issued and leaves status revoked", async () => {
    const now = new Date();
    const { grantStore, revocationService, grantNonce, revocationChallengeStore } = seedRevocationTestGrant({
      status: "revoked",
      agreedScope: { txTypes: ["transfer"], maxAmount: 500 },
      agreedDuration: {
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 3600_000).toISOString(),
      },
    });

    const outcome = await revocationService.request({ grantNonce });

    expect(outcome).toEqual({ ok: false, reason: "grant_not_active" });
    expect(revocationChallengeStore.sizeForTesting()).toBe(0);
    expect(grantStore.get(grantNonce)?.status).toBe("revoked");
  });
});
