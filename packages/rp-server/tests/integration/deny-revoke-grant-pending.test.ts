import { describe, it, expect } from "vitest";
import { seedRevocationTestGrant } from "./revocation-test-helpers.js";

// spec.md User Story 2, Scenario 1 / SC-003: a `pending` Grant Record denies a revocation
// request with no challenge issued.
describe("Revocation request denies a pending Grant (User Story 2)", () => {
  it("denies with no challenge issued", async () => {
    const now = new Date();
    const { revocationService, grantNonce, revocationChallengeStore } = seedRevocationTestGrant({
      status: "pending",
      agreedScope: { txTypes: ["transfer"], maxAmount: 500 },
      agreedDuration: {
        validFrom: now.toISOString(),
        validUntil: new Date(now.getTime() + 3600_000).toISOString(),
      },
    });

    const outcome = await revocationService.request({ grantNonce });

    expect(outcome).toEqual({ ok: false, reason: "grant_not_active" });
    expect(revocationChallengeStore.sizeForTesting()).toBe(0);
  });
});
