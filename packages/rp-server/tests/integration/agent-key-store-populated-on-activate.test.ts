import { describe, it, expect } from "vitest";
import { activateTestGrant } from "./transaction-test-helpers.js";

// research.md §1 / plan.md Foundational T006-T007: confirms AgentKeyStore is populated as a
// side effect of a real /grant/activate success (via CredentialValidationService.activate()),
// not a separately-triggered write — this is the one place 002-transact's implementation
// touches 001-grant's existing code, and this test exercises that wiring end-to-end.
describe("AgentKeyStore population on grant activation", () => {
  it("records the Credential's agentPublicKey keyed by grant nonce once activation succeeds", async () => {
    const now = new Date();
    const duration = {
      validFrom: now.toISOString(),
      validUntil: new Date(now.getTime() + 3600_000).toISOString(),
    };
    const { ctx, grantNonce, agentKeypair } = await activateTestGrant(
      { txTypes: ["transfer"], maxAmount: 500 },
      duration,
    );

    expect(ctx.agentKeyStore.get(grantNonce)).toEqual(agentKeypair.publicKeyJwk);
  });

  it("has no entry for a grant nonce that was never activated", async () => {
    const { AgentKeyStore } = await import("../../src/models/agent-key-store.js");
    const store = new AgentKeyStore();
    expect(store.get("never-activated-nonce")).toBeUndefined();
  });
});
