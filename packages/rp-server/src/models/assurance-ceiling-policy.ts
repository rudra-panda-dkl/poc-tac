import type { AssuranceLevel } from "@tac/shared";

export interface AssuranceCeiling {
  maxDurationSeconds: number;
}

/** RP-owned policy artifact (FR-007a, resolves OQ-2) — an assurance-level-indexed ceiling that
 * bounds negotiation as a hard limit; the specific scope/duration within that ceiling is
 * negotiated freeform. Concrete values are implementation-defined for this POC, not specified
 * by spec.md — see specs/001-grant/data-model.md "Entity: Assurance Ceiling Policy". */
export class AssuranceCeilingPolicy {
  constructor(private readonly ceilings: Map<AssuranceLevel, AssuranceCeiling>) {}

  static defaultPolicy(): AssuranceCeilingPolicy {
    return new AssuranceCeilingPolicy(
      new Map<AssuranceLevel, AssuranceCeiling>([
        // POC-reasonable defaults, not spec-mandated (FR-007a) — user presence only gets a
        // short ceiling; presence + verification gets a longer one.
        ["UP", { maxDurationSeconds: 15 * 60 }],
        ["UP+UV", { maxDurationSeconds: 24 * 60 * 60 }],
      ]),
    );
  }

  getCeilingSeconds(level: AssuranceLevel): number {
    const ceiling = this.ceilings.get(level);
    if (!ceiling) {
      throw new Error(`No assurance ceiling configured for level "${level}"`);
    }
    return ceiling.maxDurationSeconds;
  }

  isWithinCeiling(level: AssuranceLevel, durationSeconds: number): boolean {
    return durationSeconds <= this.getCeilingSeconds(level);
  }
}
