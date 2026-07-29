import { describe, it, expect } from "vitest";
import { AssuranceCeilingPolicy } from "../../src/models/assurance-ceiling-policy.js";

describe("AssuranceCeilingPolicy (FR-007a, resolves OQ-2)", () => {
  it("allows a duration exactly at the ceiling", () => {
    const policy = AssuranceCeilingPolicy.defaultPolicy();
    const ceiling = policy.getCeilingSeconds("UP");
    expect(policy.isWithinCeiling("UP", ceiling)).toBe(true);
  });

  it("rejects a duration one second over the ceiling", () => {
    const policy = AssuranceCeilingPolicy.defaultPolicy();
    const ceiling = policy.getCeilingSeconds("UP");
    expect(policy.isWithinCeiling("UP", ceiling + 1)).toBe(false);
  });

  it("gives UP+UV a strictly higher ceiling than UP", () => {
    const policy = AssuranceCeilingPolicy.defaultPolicy();
    expect(policy.getCeilingSeconds("UP+UV")).toBeGreaterThan(policy.getCeilingSeconds("UP"));
  });

  it("throws for an unconfigured assurance level", () => {
    const policy = new AssuranceCeilingPolicy(new Map());
    expect(() => policy.getCeilingSeconds("UP")).toThrow();
  });
});
