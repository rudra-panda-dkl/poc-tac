# Implementation Plan: TAC Grant Revocation Flow (Feature 3 of 3)

**Branch**: `003-revoke` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-revoke/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Implement lightweight, RP-local, synchronous grant revocation: the User authenticates via a
single WebAuthn assertion ceremony (reusing 001-grant's ceremony-one mechanism unchanged) to
present a fresh, single-use revocation challenge bound to one specific `active` Grant Record, and
the RP transitions that record's status to `revoked`. No new revocation-status check is added to
002-transact's transaction-time gate — its existing `status === "active"` check, re-run at both
request time and respond time, is confirmed (by direct source inspection performed before this
plan was written) to already deliver the "no propagation delay" guarantee Constitution Principle
VIII requires, once `status` can hold `revoked` as a value. Technical approach: extend the
existing `rp-server` and `user-client` packages (no new packages, and — unlike 002-transact —
`agent-client` is untouched, since the Agent has no role in revocation) with a two-endpoint
request/respond flow mirroring 002-transact's own shape, a new in-memory
`RevocationChallengeStore` independent from both existing single-use-artifact stores, and one
small, additive extension to 001-grant's `GrantRecordStatus` enum and `GrantRecordStore`.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS — unchanged from 001-grant/002-transact;
same monorepo.

**Primary Dependencies**: No new dependencies. Reuses `@simplewebauthn/server` (already an
`rp-server` dependency) and `@simplewebauthn/browser` (already a `user-client` dependency) for
the single WebAuthn ceremony this feature needs — the same `buildAuthenticationOptions()` /
`verifyAssertion()` helpers ceremony one already uses, unmodified. No JCS/digest machinery
(`packages/shared/src/canonicalize.ts`) is needed: revocation has no assembled document to sign
over, only a server challenge (research.md §1).

**Storage**: One new in-memory, process-local store in `rp-server`, scoped to this POC's
single-RP-instance assumption (unchanged): `RevocationChallengeStore` (keyed by challenge ID,
FR-009). Neither persists across process restart, matching every other single-use-artifact store
in this codebase.

**Testing**: Vitest — unchanged, same monorepo config.

**Target Platform**: RP server: Linux/Node.js server process (unchanged). User client: modern
WebAuthn-capable browser (unchanged from 001-grant) — this feature adds a User-facing ceremony,
so, unlike 002-transact, `user-client` is touched. Agent client: untouched by this feature; the
Agent has no role in revocation (spec.md Edge Cases, research.md §6).

**Project Type**: Extension of the existing multi-package monorepo (`packages/shared`,
`packages/rp-server`, `packages/user-client`) — no new package. `packages/agent-client` is
untouched by this feature (the inverse of 002-transact's stance on `user-client`).

**Performance Goals**: Not a load-bearing POC concern, same as 001-grant/002-transact; no
throughput/latency target specified beyond the protocol-shape requirement already captured in
FR-012 (no propagation delay), which research.md §5 confirms is satisfied by construction, not by
a performance budget.

**Constraints**: Revocation authentication MUST be a single WebAuthn assertion ceremony reusing
ceremony one's mechanism — MUST NOT be a second, locally-signed ceremony (FR-004). The revocation
challenge layer MUST NOT share storage or consumption logic with either 001-grant's grant-nonce
layer or 002-transact's transaction-challenge layer (FR-009). This feature MUST NOT modify
002-transact's `TransactionService` to add a new revocation-status check (FR-012) — the existing
`status === "active"` check is the sole mechanism relied upon.

**Scale/Scope**: Single RP instance; no multi-RP or multi-agent federation (constitution
non-goal, unchanged); one revocation request targets exactly one Grant Record, no bulk operation
(FR-015); POC-scale traffic, not production load.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Authentication Is Not Delegation (NON-NEGOTIABLE) | PASS | No OAuth-style token or delegation artifact is issued; the revoked acknowledgment (FR-011) is a bespoke RP-local HTTP response, not presented as conforming to any external authorization standard. |
| II. Two-Ceremony, One-Round-Trip Grant Protocol (NON-NEGOTIABLE) | N/A (out of scope) | This principle's text is scoped to "every grant," i.e., grant issuance. Revocation reuses ceremony one's authentication mechanism as a single ceremony (FR-004) — it is not a grant, and does not attempt Principle II's two-ceremony structure. |
| III. Assurance-Bound, Signed Scope | N/A (out of scope) | Revocation negotiates no scope or duration; this feature's FRs neither read nor re-derive assurance level. |
| IV. Bounded Pending-Grant State | N/A (out of scope) | This feature creates no `pending` *Grant Record* state; it only reads an existing Grant Record's `status` and transitions it to `revoked`. The revocation challenge's own short lifetime is governed by Principle V (below), not IV, which is scoped specifically to Grant Records. |
| V. Single-Use Artifact Consumption Ordering (NON-NEGOTIABLE) | PASS | `RevocationChallengeStore.retrieveForVerification()` (research.md §3) marks the revocation challenge consumed at the instant of retrieval, before Grant-state re-check or signature validation run (FR-007) — the same proven-correct shape as `GrantRecordStore`'s and `TransactionChallengeStore`'s methods, deliberately copied rather than reinvented. Principle V explicitly names "revocation challenge" as the third sibling artifact type requiring this. |
| VI. Dual-Layer Replay Protection, Not Conflated | N/A (out of scope) | This principle's own text defines exactly two layers — grant-time nonce and transaction-time freshness — and does not itself name a third. The revocation-challenge layer's distinctness requirement instead comes from Principle V's three-artifact list and this feature's own FR-009, not from Principle VI. |
| VII. Agent-Held Keys, Never Custodied | N/A (out of scope) | The Agent has no role in revocation at all (spec.md Edge Cases); no Agent key material is read, generated, or transmitted by this feature. |
| VIII. Lightweight, RP-Local, Synchronous Revocation | PASS | This is this feature's entire purpose. RP-local endpoint, authenticated via the User's passkey-bound identity (FR-004/FR-005), challenge cryptographically bound to the specific credential being revoked with no cross-credential replay (FR-006, research.md §2). Synchronous, no-propagation-delay checking (FR-012) is achieved by relying on 002-transact's existing Grant-state gate rather than new machinery — verified by direct source inspection (research.md §5), not merely assumed. No heavyweight global revocation infrastructure is built. Rollback of in-flight transactions is explicitly not guaranteed (FR-013), matching this principle's own "does not guarantee rollback" clause. **Caveat**: the "no propagation delay" verification is scoped to 001-grant's single-RP-instance, in-memory-store assumption (research.md §5's "Dependency, not an independent guarantee" note) — this feature inherits that dependency rather than establishing synchronicity independently. |
| IX. Provenance Over Correctness; Humans-in-the-Loop for Exceptions Only | PASS | FR-013 bounds this feature to the status transition only — no downstream business-transaction rollback is performed or simulated, consistent with 002-transact's own FR-013 boundary (nothing downstream was ever modeled to roll back). |

No unjustified violations. The one cross-feature wrinkle — 003-revoke extending 001-grant's
`GrantRecordStatus` enum and `GrantRecordStore` (research.md §4) — is not a Constitution
violation: 001-grant's own `grant-record.ts` docblock already reserved this exact extension
point, and it is additive (a new enum member plus a new method mirroring two existing ones), not
a redefinition of any existing field or method's behavior. No entries required in Complexity
Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-revoke/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/
├── shared/                              # (extended, not new)
│   └── src/
│       └── grant-record.ts              # MODIFIED: GrantRecordStatus gains "revoked"
│                                         #   (reachable only from "active", FR-010) — 001-grant's
│                                         #   own docblock already reserved this extension point.
│                                         #   No other field or type in shared/ changes.
│
├── rp-server/                            # (extended, not new)
│   ├── src/
│   │   ├── app.ts                        # MODIFIED: instantiates RevocationChallengeStore +
│   │   │                                 #   RevocationService, routes the two new endpoints below
│   │   ├── models/
│   │   │   ├── grant-record-store.ts     # MODIFIED: adds transitionToRevoked(nonce), mirroring
│   │   │   │                             #   transitionToActive/transitionToExpired's exact shape
│   │   │   └── revocation-challenge-store.ts  # NEW (FR-007/FR-008/FR-009, research.md §3)
│   │   ├── services/
│   │   │   └── revocation-service.ts     # NEW: Grant-state gate (FR-001/002), challenge issuance
│   │   │                                 #   scoped to the Grant owner's credential (FR-003,
│   │   │                                 #   research.md §2), response verification + status
│   │   │                                 #   transition + acknowledgment (FR-005/006/007/008/
│   │   │                                 #   010/011)
│   │   └── api/
│   │       ├── revoke-request.ts         # NEW: POST /revoke/request handler
│   │       └── revoke-respond.ts         # NEW: POST /revoke/respond handler
│   └── tests/
│       ├── contract/
│       │   ├── revoke-request.test.ts    # NEW (happy path over real HTTP, mirrors transact-request.test.ts)
│       │   └── revoke-respond.test.ts    # NEW (happy path over real HTTP, mirrors transact-respond.test.ts)
│       ├── integration/
│       │   ├── revocation-test-helpers.ts                        # NEW: activateSingleGrantWithRevocation(),
│       │   │                                                     #   activateGrantOnContext(), signRevocationChallenge(),
│       │   │                                                     #   seedRevocationTestGrant(), buildTransactionServiceOnContext()
│       │   ├── full-revocation-flow.test.ts                      # NEW (US1, SC-001)
│       │   ├── transaction-denied-after-revocation.test.ts       # NEW (US1, SC-002)
│       │   ├── transaction-denied-mid-flight-revocation.test.ts  # NEW (US1 — the specific case research.md §5 depends on)
│       │   ├── deny-revoke-grant-pending.test.ts                 # NEW (US2, SC-003)
│       │   ├── deny-revoke-grant-expired.test.ts                 # NEW (US2, SC-003)
│       │   ├── deny-revoke-already-revoked.test.ts                # NEW (US2, SC-003)
│       │   ├── deny-revoke-unknown-grant-reference.test.ts        # NEW (US2, spec.md Edge Case)
│       │   ├── cross-grant-revocation-replay.test.ts              # NEW (US2, SC-004)
│       │   ├── deny-revoke-invalid-signature.test.ts              # NEW (US2, SC-004)
│       │   ├── deny-revoke-no-side-effects.test.ts                # NEW (US2)
│       │   ├── revocation-replay-after-success.test.ts            # NEW (US3, SC-005)
│       │   ├── revocation-replay-after-failure.test.ts            # NEW (US3, SC-005)
│       │   ├── revocation-challenge-expiry.test.ts                # NEW (US3)
│       │   └── revocation-challenge-independent-from-other-layers.test.ts  # NEW (US3, FR-009)
│       └── unit/
│           └── revocation-challenge-store.test.ts  # NEW (mirrors transaction-challenge-store.test.ts)
│
└── user-client/                          # (extended, not new — untouched by 002-transact,
    │                                     #   touched here instead: the inverse split)
    ├── src/
    │   ├── ceremonies/
    │   │   └── revoke.ts                 # NEW: runRevocation() — fetch options, startAuthentication(),
    │   │                                 #   POST result; same shape as ceremony-one.ts's
    │   │                                 #   runCeremonyOne() (research.md §6). NOT called by the
    │   │                                 #   demo script below — startAuthentication() requires a
    │   │                                 #   real browser, same reason demo/negotiate.ts and
    │   │                                 #   demo/sign.ts don't call ceremony-one.ts/ceremony-two.ts
    │   └── demo/
    │       └── revoke.ts                 # NEW: self-contained manual demo script (negotiates,
    │                                     #   activates, revokes, confirms denial) using the
    │                                     #   Node-compatible software-authenticator signer, plus
    │                                     #   a throwaway Agent keypair (inert data here — no real
    │                                     #   @tac/agent-client dependency needed)
    └── package.json                      # MODIFIED: adds a `demo:revoke` script

# packages/agent-client/ — untouched by this feature (no Agent role in revocation,
# spec.md Edge Cases, research.md §6)
```

**Structure Decision**: No new package. This feature extends `shared`, `rp-server`, and
`user-client` — the inverse package split from 002-transact, which touched `agent-client` and
left `user-client` untouched. This is a direct consequence of who authenticates each ceremony
(Agent for transactions, User for revocation), not an arbitrary choice. Keeps the same
npm-workspaces monorepo shape 001-grant's plan.md set up as shared groundwork for all three
features.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 (data-model.md, contracts/revoke-api.yaml, quickstart.md): the
`Revocation Challenge` entity and the `/revoke/request` + `/revoke/respond` contract preserve
every gate from the pre-Phase-0 Constitution Check above. In particular, `revoke-api.yaml`
confirms `/revoke/respond`'s request body carries only `{challengeId, assertionResponse}` — no
field through which a caller could assert *which* Grant Record it targets — so FR-006's
cross-credential-replay protection holds at the API-contract level, not just as a narrative rule.
No new violations introduced; no changes to the table above.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this table is intentionally empty. Constitution Check above found no unjustified
deviations from any NON-NEGOTIABLE principle.
