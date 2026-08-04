import { describe, it, expect } from "vitest";
import { GrantRecordStore } from "../../src/models/grant-record-store.js";
import { RegisteredPasskeyStore } from "../../src/models/registered-passkey-store.js";
import { RevocationChallengeStore } from "../../src/models/revocation-challenge-store.js";
import { RevocationService } from "../../src/services/revocation-service.js";

// spec.md Edge Cases: an unknown/bogus grant reference is denied identically to a not-active
// Grant, with no challenge issued.
describe("Revocation request denies an unknown grant reference (User Story 2, Edge Case)", () => {
  it("denies with the same reason as a not-active Grant, and issues no challenge", async () => {
    const grantStore = new GrantRecordStore();
    const passkeyStore = new RegisteredPasskeyStore();
    const revocationChallengeStore = new RevocationChallengeStore();
    const revocationService = new RevocationService(grantStore, passkeyStore, revocationChallengeStore);

    const outcome = await revocationService.request({ grantNonce: "never-issued-grant-nonce" });

    expect(outcome).toEqual({ ok: false, reason: "grant_not_active" });
    expect(revocationChallengeStore.sizeForTesting()).toBe(0);
  });
});
