# Implementation Plan: TAC Grant Flow (Feature 1 of 3)

**Branch**: `001-grant` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-grant/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Implement the TAC grant/issuance flow: a two-WebAuthn-ceremony protocol in which a User
authenticates and negotiates assurance-bound scope/duration with an RP (ceremony one, server
challenge), then signs the assembled credential locally over a deterministically-computed digest
with no further server round-trip (ceremony two). The RP persists a bounded-lifetime `pending`
Grant Record at nonce issuance and activates it only after validating ceremony two's signed
credential. Technical approach: Node.js/TypeScript across all three actors (User's browser
client, the Agent's client, and the RP server), using SimpleWebAuthn for both WebAuthn ceremonies,
RFC 8785 (JCS) for deterministic credential canonicalization ahead of the ceremony-two digest, and
an in-memory Grant Record store scoped to a single RP instance, per this POC's stated scale.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (both server and client-side code
transpiled/bundled for the browser where needed)

**Primary Dependencies**: `@simplewebauthn/server` and `@simplewebauthn/browser` (WebAuthn
ceremonies one and two); `canonicalize` npm package (RFC 8785 JCS reference implementation, used
identically on the User-signing side and RP-verification side per FR-021); Node's built-in
`crypto`/WebCrypto `SubtleCrypto` for SHA-256 digest and Agent keypair generation (no external
crypto library needed)

**Storage**: In-memory Grant Record store (a single process-local keyed map), per this POC's
single-RP-instance scale (Assumptions); no external database for this feature

**Testing**: Vitest (TypeScript-native, shares config/tooling across the RP server, User client,
and Agent client packages)

**Target Platform**: RP server: Linux/Node.js server process. User client: modern
WebAuthn-capable browser (Chrome/Safari/Firefox current versions — platform authenticator or
security key). Agent client: Node.js process (software Agent, not a browser context) using
WebCrypto for its own keypair — the Agent's keypair is a plain asymmetric keypair generated via
platform crypto, **not** a WebAuthn passkey; only the User's ceremonies are WebAuthn.

**Project Type**: Multi-package web application — three cooperating actors (User's browser
client, RP server, Agent client) sharing a canonicalization module; see Project Structure below
for why this doesn't reduce to a plain frontend+backend split.

**Performance Goals**: Not a load-bearing POC concern; no throughput/latency target is specified
by the spec beyond SC-001's structural "no more than one network round-trip" requirement, which is
a protocol-shape constraint, not a performance metric.

**Constraints**: Exactly two WebAuthn ceremonies from the User, with no server round-trip between
them (FR-003/FR-004, NON-NEGOTIABLE per Constitution Principle II); grant nonce validity window
must default to 5 minutes and always be strictly shorter than the credential's own validity window
(FR-012); Agent private key must never be transmitted to or observable by User or RP (FR-017,
Constitution Principle VII).

**Scale/Scope**: Single RP instance; no multi-RP or multi-agent federation (constitution
non-goal); POC-scale traffic, not production load.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Authentication Is Not Delegation (NON-NEGOTIABLE) | PASS | No OAuth-style token or delegation artifact is issued anywhere in this design; activation is purely the Grant Record's `pending`→`active` transition (FR-001). Negotiation/handoff channels are bespoke RP-local HTTP endpoints, not presented as conforming to any external authorization standard (FR-002). |
| II. Two-Ceremony, One-Round-Trip Grant Protocol (NON-NEGOTIABLE) | PASS, with Phase 0 gate | Ceremony one uses `@simplewebauthn/server` with a server-issued challenge; ceremony two uses `navigator.credentials.get()` with `challenge` set to the locally-computed JCS digest — no new server call between nonce issuance and ceremony two. Per the spec's Clarifications (resolves OQ-1), this MUST be validated as a Phase 0 research spike (see research.md) with a defined fallback before implementation proceeds. |
| III. Assurance-Bound, Signed Scope | PASS | Assurance level derived from ceremony one's UP/UV signals (FR-006), bounded by an RP-owned ceiling policy (FR-007a), and carried as a User-signed field in the credential (FR-008), checked again at activation (FR-009). |
| IV. Bounded Pending-Grant State | PASS | Grant Record persisted `pending` at nonce issuance (FR-010); nonce window (5 min default) strictly shorter than credential validity (FR-012); expiry transitions to `expired` (FR-013). |
| V. Single-Use Artifact Consumption Ordering (NON-NEGOTIABLE) | PASS | Grant Record store's nonce-retrieval operation marks the nonce consumed atomically at retrieval, before signature/terms/account checks run (FR-014/FR-015) — enforced as an in-memory store method, not a side effect of a later success branch. |
| VI. Dual-Layer Replay Protection, Not Conflated | PASS (partial scope) | This feature implements only the grant-nonce layer (FR-016); session/transaction-time freshness is explicitly out of scope (002-transact). |
| VII. Agent-Held Keys, Never Custodied | PASS | Agent generates its own WebCrypto keypair locally in its own process; private key never transmitted to User or RP (FR-017). Only the per-RP default key-scoping mode is built (FR-018) — no per-credential opt-in code path exists in this feature, per Clarifications resolving OQ-4. |
| VIII. Lightweight, RP-Local, Synchronous Revocation | N/A (out of scope) | Revocation is 003-revoke's concern; not implemented here. |
| IX. Provenance Over Correctness; Humans-in-the-Loop for Exceptions Only | N/A (out of scope) | Exception handling is a later feature's concern. |

No unjustified violations. Principle II carries a documented, spec-mandated Phase 0 gate rather
than a violation — see research.md for the conformance analysis and fallback. No entries are
required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-grant/
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
├── shared/                    # canonicalization + credential/digest logic shared by all three actors
│   ├── src/
│   │   ├── canonicalize.ts    # RFC 8785 (JCS) wrapper, single source of truth for FR-021
│   │   ├── credential.ts      # Credential TypeScript type (handoff contract)
│   │   └── grant-record.ts    # Grant Record TypeScript type (handoff contract)
│   └── tests/unit/
│
├── rp-server/                 # RP: negotiation, nonce issuance, credential verification
│   ├── src/
│   │   ├── models/            # GrantRecord store (in-memory), AssuranceCeilingPolicy
│   │   ├── services/          # negotiation, nonce issuance/consumption, credential validation
│   │   └── api/                # HTTP endpoints: ceremony-one negotiate, credential-present
│   └── tests/
│       ├── contract/          # API contract tests (see contracts/)
│       ├── integration/       # full grant flow, replay/expiry scenarios
│       └── unit/
│
├── user-client/                # User's browser: ceremony one + ceremony two orchestration
│   ├── src/
│   │   ├── ceremonies/          # authenticate+negotiate (ceremony one), sign-digest (ceremony two)
│   │   └── services/            # calls to rp-server API
│   └── tests/
│       ├── integration/
│       └── unit/
│
└── agent-client/                # Agent: local keypair generation, credential assembly/present
    ├── src/
    │   ├── keypair/              # per-RP WebCrypto keypair generation (FR-017/FR-018)
    │   └── credential/           # assembles identity/scope/temporal/integrity blocks
    └── tests/
        ├── integration/
        └── unit/
```

**Structure Decision**: TAC's grant flow has three distinct actors — the User's browser (WebAuthn
ceremonies), the Agent (a software client, not a browser), and the RP server — so this doesn't
reduce to a plain frontend+backend split (Option 2) or a single project (Option 1). Chosen layout
is an npm-workspaces monorepo with one package per actor plus a `shared` package holding the JCS
canonicalization logic (FR-021), so the User-signing side and RP-verification side import the
*same* implementation rather than risking behavioral drift between two independent
implementations of the same canonicalization rule. This structure is shared groundwork for
002-transact and 003-revoke, which will add packages/services alongside these rather than
restructuring them.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 (data-model.md, contracts/grant-api.yaml, quickstart.md): the
`Credential`/`Grant Record` shapes and the `/grant/negotiate`+`/grant/activate` contract preserve
every gate from the pre-Phase-0 Constitution Check above — in particular, `/grant/negotiate`'s
response schema deliberately omits `agreedScope`/`agreedDuration` from anything the Agent client
consumes (only `rpIdentifier` is passed to `agent-client`'s keypair step in quickstart.md Scenario
1, step 2), keeping FR-018a/Principle-adjacent blind-until-delivery intact at the API-contract
level, not just as a narrative rule. No new violations introduced; no changes to the table above.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this table is intentionally empty. Constitution Check above found no unjustified
deviations from any NON-NEGOTIABLE principle.
