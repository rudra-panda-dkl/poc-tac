# Implementation Plan: TAC Transaction Flow (Feature 2 of 3)

**Branch**: `002-transact` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-transact/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Implement the transaction-time half of TAC's dual-layer replay protection: given an `active`
Grant Record and Credential already produced by 001-grant, the RP gates a transaction request
against Grant state (active, in-scope, in-window), issues a fresh single-use challenge distinct
from 001-grant's grant nonce, and the Agent proves live key possession by signing that challenge
plus the transaction's own request parameters with the private key from its already-generated
per-RP keypair — no WebAuthn ceremony, no human present. Technical approach: extend the existing
`rp-server` and `agent-client` packages (no new packages) with a two-endpoint request/respond
flow, a new in-memory `TransactionChallengeStore` independent from `GrantRecordStore`, a small
`AgentKeyStore` addition to persist the Agent public key past 001-grant's activation step (closing
a gap where 001-grant's own "handoff contract" claim for `Credential` wasn't actually backed by
persistence — research.md §1), and raw WebCrypto ECDSA sign/verify reusing the same `canonicalize`
(JCS) dependency 001-grant already established in `packages/shared`.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS — unchanged from 001-grant; same monorepo.

**Primary Dependencies**: No new dependencies. Reuses `packages/shared`'s existing `canonicalize`
(RFC 8785 JCS) package and Node's built-in WebCrypto `SubtleCrypto` (ECDSA P-256 sign/verify,
already used for Agent keypair generation in 001-grant). `@simplewebauthn/*` is deliberately NOT a
dependency of this feature's transaction-time code path (FR-006 forbids a WebAuthn ceremony here).

**Storage**: Two new in-memory, process-local stores in `rp-server`, both scoped to this POC's
single-RP-instance assumption (unchanged from 001-grant): `TransactionChallengeStore` (keyed by
challenge ID, FR-010) and `AgentKeyStore` (keyed by grant nonce, research.md §1). Neither persists
across process restart; neither is a durable transaction-history log (Key Entities: "Ephemeral
only").

**Testing**: Vitest — unchanged from 001-grant, same monorepo config.

**Target Platform**: RP server: Linux/Node.js server process (unchanged). Agent client: Node.js
process (unchanged) — this feature adds no browser-side code, since `user-client` (the only
browser-context package) has no role at transaction time (Constitution Principle VI: no human
present).

**Project Type**: Extension of the existing multi-package monorepo (`packages/shared`,
`packages/rp-server`, `packages/agent-client`) — no new package. `packages/user-client` is
untouched by this feature.

**Performance Goals**: Not a load-bearing POC concern, same as 001-grant; no throughput/latency
target specified beyond the protocol-shape requirements already captured in FR-005/FR-008.

**Constraints**: The challenge-response signing step MUST NOT be, or be presented as, a WebAuthn
ceremony (FR-006, NON-NEGOTIABLE per Constitution Principle VI). The transaction-time challenge
layer MUST NOT share storage or consumption logic with 001-grant's grant-nonce layer (FR-010).
The Agent-proactively-generated-proof (DPoP-style) approach is explicitly not adopted, with no
exception (FR-005, spec.md Assumptions).

**Scale/Scope**: Single RP instance; no multi-RP or multi-agent federation (constitution
non-goal, unchanged); POC-scale traffic, not production load.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Authentication Is Not Delegation (NON-NEGOTIABLE) | PASS | No OAuth-style token or delegation artifact is issued; the permit decision (FR-012) is this feature's endpoint, and it is a bespoke RP-local HTTP response, not presented as conforming to any external authorization standard. |
| II. Two-Ceremony, One-Round-Trip Grant Protocol (NON-NEGOTIABLE) | N/A (out of scope) | This feature presupposes an already-`active` Grant Record from 001-grant (Assumptions); it introduces no new WebAuthn ceremony of its own. |
| III. Assurance-Bound, Signed Scope | N/A (out of scope) | Assurance level was fixed at grant time by 001-grant; this feature's FRs neither read nor re-derive it. |
| IV. Bounded Pending-Grant State | N/A (out of scope) | This feature creates no `pending` state; it only reads an existing Grant Record's `status`. |
| V. Single-Use Artifact Consumption Ordering (NON-NEGOTIABLE) | PASS | `TransactionChallengeStore.retrieveForVerification()` (research.md §3) marks the transaction challenge consumed at the instant of retrieval, before signature validation or Grant-state re-check run (FR-008) — the same proven-correct shape as `GrantRecordStore`'s method from 001-grant, deliberately copied rather than reinvented. |
| VI. Dual-Layer Replay Protection, Not Conflated | PASS | This feature implements layer (b): a fresh RP-issued challenge per transaction, Agent-signed with its own private key, explicitly not a passkey ceremony (FR-006) and not carrying human-presence semantics. Storage is independent from layer (a)'s grant nonce (FR-010, research.md §3) — no shared `Map`, no shared consumption method. |
| VII. Agent-Held Keys, Never Custodied | PASS | No new key material is introduced. The Agent signs with the private key from its existing per-RP keypair (`agent-client`'s `getOrCreateAgentKeypair`, unchanged from 001-grant); the private key is never transmitted (research.md §2). |
| VIII. Lightweight, RP-Local, Synchronous Revocation | N/A (out of scope) | FR-014: this feature explicitly does not implement revocation; 003-revoke's concern. |
| IX. Provenance Over Correctness; Humans-in-the-Loop for Exceptions Only | PASS | FR-013/FR-015 bound this feature to the permit/deny decision only — no downstream business-transaction execution, no human-in-the-loop exception mechanism is built here; an RP-side denial fully satisfies the requirement. |

No unjustified violations. The one cross-feature wrinkle — 002-transact needing a small,
additive persistence change to 001-grant's `rp-server` (research.md §1, `AgentKeyStore`) — is not
a Constitution violation: it doesn't redefine `Credential` or `GrantRecord`'s field-level
contract, doesn't touch any NON-NEGOTIABLE principle, and is scoped to the one field 001-grant's
own `data-model.md` already claimed was being handed off but wasn't actually persisted. No entries
required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-transact/
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
│   ├── src/
│   │   ├── transaction.ts               # NEW: TransactionSignaturePayload type, canonicalize+sign
│   │   │                                 #   payload shape shared by agent-client (sign) and
│   │   │                                 #   rp-server (verify) — same rationale as credential.ts
│   │   │                                 #   / canonicalize.ts in 001-grant (FR-007).
│   │   ├── credential.ts                # (unchanged)
│   │   ├── grant-record.ts              # (unchanged — no fields added, per Key Entities)
│   │   ├── canonicalize.ts              # MODIFIED: base64urlToBuffer()'s return-type annotation
│   │   │                                 #   fixed (Uint8Array<ArrayBuffer> instead of bare
│   │   │                                 #   Uint8Array) so a decoded buffer satisfies WebCrypto's
│   │   │                                 #   BufferSource typing when fed into crypto.subtle.verify()
│   │   │                                 #   — never exercised that way by 001-grant (T003)
│   │   └── index.ts                     # MODIFIED: adds `export * from "./transaction.js"` (T003)
│   └── tests/unit/
│       └── transaction.test.ts          # NEW
│
├── rp-server/                            # (extended, not new)
│   ├── src/
│   │   ├── app.ts                        # MODIFIED: instantiates AgentKeyStore + TransactionChallengeStore
│   │   │                                 #   + TransactionService, wires them into
│   │   │                                 #   CredentialValidationService (T007), and routes the
│   │   │                                 #   two new endpoints below (T017)
│   │   ├── models/
│   │   │   ├── grant-record-store.ts     # MODIFIED: adds non-consuming get() read accessor
│   │   │   │                             #   (TransactionService's Grant-state gate needs a
│   │   │   │                             #   repeatable read, distinct from retrieveForVerification()'s
│   │   │   │                             #   consume-once semantics — T006)
│   │   │   ├── transaction-challenge-store.ts  # NEW (FR-008/FR-009/FR-010, research.md §3)
│   │   │   └── agent-key-store.ts        # NEW (research.md §1)
│   │   ├── services/
│   │   │   ├── credential-validation-service.ts  # MODIFIED: on successful activate(), also
│   │   │   │                                       #   records agentPublicKey into AgentKeyStore
│   │   │   └── transaction-service.ts    # NEW: Grant-state gate (FR-002/003/004), challenge
│   │   │                                 #   issuance (FR-005), response verification + permit
│   │   │                                 #   decision (FR-007/008/009/011/012)
│   │   └── api/
│   │       ├── transact-request.ts       # NEW: POST /transact/request handler
│   │       └── transact-respond.ts       # NEW: POST /transact/respond handler
│   └── tests/
│       ├── contract/
│       │   ├── transact-request.test.ts  # NEW
│       │   └── transact-respond.test.ts  # NEW
│       ├── integration/
│       │   ├── test-helpers.ts                # MODIFIED (001-grant file): setupTestRp() now also
│       │   │                                   #   constructs an AgentKeyStore and threads it into
│       │   │                                   #   CredentialValidationService's constructor (T006)
│       │   ├── transaction-test-helpers.ts     # NEW: activateTestGrant() + seedGrantRecord() —
│       │   │                                   #   this feature's own test-setup helpers, not a
│       │   │                                   #   test file itself
│       │   ├── full-transaction-flow.test.ts               # NEW (US1, SC-002/SC-006)
│       │   ├── agent-key-store-populated-on-activate.test.ts  # NEW (US1)
│       │   ├── deny-grant-pending.test.ts                  # NEW (US2, SC-001)
│       │   ├── deny-grant-expired.test.ts                  # NEW (US2, SC-001)
│       │   ├── deny-out-of-scope-txtype.test.ts             # NEW (US2, SC-003)
│       │   ├── deny-out-of-scope-amount.test.ts             # NEW (US2, SC-003)
│       │   ├── deny-out-of-window.test.ts                  # NEW (US2, SC-004)
│       │   ├── deny-invalid-signature.test.ts               # NEW (US2)
│       │   ├── deny-no-side-effects.test.ts                # NEW (US2)
│       │   ├── deny-unknown-grant-reference.test.ts         # NEW (US2, spec.md Edge Case)
│       │   ├── transaction-replay-after-success.test.ts     # NEW (US3, SC-005)
│       │   ├── transaction-replay-after-failure.test.ts     # NEW (US3, SC-005)
│       │   ├── transaction-challenge-expiry.test.ts         # NEW (US3)
│       │   └── transaction-challenge-independent-from-grant-nonce.test.ts  # NEW (US3, FR-010)
│       └── unit/
│           └── transaction-challenge-store.test.ts  # NEW
│
└── agent-client/                         # (extended, not new)
    ├── src/
    │   ├── keypair/generate-keypair.ts   # MODIFIED: generateKey() usages changed from ["sign"]
    │   │                                 #   to ["sign", "verify"] — the ["sign"]-only call left
    │   │                                 #   the exported PUBLIC key JWK with key_ops: [] (no
    │   │                                 #   permitted operations), a pre-existing 001-grant bug
    │   │                                 #   invisible until this feature first verified against
    │   │                                 #   it (T012). Private key still only gets `sign`,
    │   │                                 #   non-extractable, unchanged.
    │   └── transact/
    │       ├── sign-transaction-response.ts  # NEW: canonicalizes {challenge, txType, amount}
    │       │                                 #   and signs with the existing per-RP private key
    │       │                                 #   (FR-006 — not a WebAuthn ceremony)
    │       └── demo-transact.ts          # NEW (T018): self-contained manual demo (negotiate ->
    │                                     #   activate -> request -> respond in one process) —
    │                                     #   see tasks.md T018's note for why this replaced the
    │                                     #   two-process demo-request.ts/demo-respond.ts split
    │                                     #   originally planned here
    └── tests/
        ├── integration/
        │   └── private-key-never-observed.test.ts  # (unchanged, 001-grant)
        └── unit/
            └── generate-keypair.test.ts  # NEW (T012a, added retroactively): asserts the
                                           #   exported public key is actually verify-capable —
                                           #   regression coverage for the key_ops: [] bug above.
                                           #   No dedicated "transaction-signature" test file was
                                           #   added here as originally sketched; agent-client's
                                           #   signing function is instead exercised with real,
                                           #   verified signatures via rp-server's own contract/
                                           #   integration tests (T008-T011), which import and
                                           #   call it directly.

# packages/user-client/ — untouched by this feature (no human present at transaction time,
# Constitution Principle VI)
```

**Structure Decision**: No new package. This feature extends the three non-`user-client` packages
001-grant already established, adding one new shared type module, two new `rp-server` models plus
one new service and two new API handlers, and one new `agent-client` signing module. This keeps
the same npm-workspaces monorepo shape 001-grant's plan.md set up as shared groundwork for both
002-transact and 003-revoke, rather than restructuring it.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 (data-model.md, contracts/transact-api.yaml, quickstart.md): the
`TransactionChallenge`/`AgentKeyStore` shapes and the `/transact/request` + `/transact/respond`
contract preserve every gate from the pre-Phase-0 Constitution Check above. In particular,
`AgentKeyStore` (data-model.md) stores only `agentPublicKey` keyed by grant nonce — no
`GrantRecord` or `Credential` field is added or redefined, and `/transact/respond`'s contract
(contracts/transact-api.yaml) confirms the challenge is retrieved-and-consumed before signature
verification runs, matching FR-008's ordering at the API-contract level, not just as a narrative
rule. No new violations introduced; no changes to the table above.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this table is intentionally empty. Constitution Check above found no unjustified
deviations from any NON-NEGOTIABLE principle.
