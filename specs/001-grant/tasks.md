---

description: "Task list template for feature implementation"
---

# Tasks: TAC Grant Flow (Feature 1 of 3)

**Input**: Design documents from `/specs/001-grant/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/grant-api.yaml, quickstart.md (all present)

**Tests**: Included. spec.md structures every user story around an explicit "Independent Test" and
numbered Acceptance Scenarios, and several Success Criteria (SC-002, SC-003, SC-006, SC-007,
SC-010) are themselves pass/fail test assertions over Constitution NON-NEGOTIABLE principles (V:
consumption ordering; II: ceremony/round-trip structure; VII: Agent-held keys) — this feature's
correctness is defined in terms of tests passing, so test tasks are included rather than treated
as optional.

**Organization**: Tasks are grouped by user story. All three of this feature's user stories are
P1 (spec.md: "this is the entire feature" for US1; US2 and US3 validate NON-NEGOTIABLE constitution
principles that must hold as reliably as the happy path) — they are ordered US1 → US2 → US3 as
spec.md presents them, and US2/US3 build directly on the endpoint US1 establishes (per spec.md's
own note that US2/US3 can be tested by seeding a `pending` Grant Record directly, without
re-running US1's full negotiation).

**Gate**: Phase 2 is a mandatory conformance-validation gate, not a user story — per spec.md's
Clarifications (resolves OQ-1), plan.md's Constitution Check (Principle II row), and research.md
§1, the ceremony-two digest-as-challenge approach MUST be validated against real
browser/authenticator behavior *before any grant-flow implementation proceeds*. It is sequenced
immediately after Setup (so the required libraries are installed) and before Foundational/US1/US2/
US3, not at the end.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Per plan.md's Project Structure (npm-workspaces monorepo, one package per actor):

```text
packages/shared/{src,tests/unit}/
packages/rp-server/{src/{models,services,api},tests/{contract,integration,unit}}/
packages/user-client/{src/{ceremonies,services},tests/{integration,unit}}/
packages/agent-client/{src/{keypair,credential},tests/{integration,unit}}/
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo initialization per plan.md Project Structure

- [X] T001 Create monorepo directory structure per plan.md Project Structure: `packages/shared/{src,tests/unit}`, `packages/rp-server/src/{models,services,api}` + `packages/rp-server/tests/{contract,integration,unit}`, `packages/user-client/src/{ceremonies,services}` + `packages/user-client/tests/{integration,unit}`, `packages/agent-client/src/{keypair,credential}` + `packages/agent-client/tests/{integration,unit}`
- [X] T002 Initialize root `package.json` with npm workspaces (`packages/*`) and a shared root `tsconfig.json` (TypeScript 5.x, Node 20 LTS target) per research.md §7
- [X] T003 [P] Configure Vitest (root `vitest.config.ts` + per-package config extension) shared across all four packages per research.md §5
- [X] T004 [P] Configure ESLint + Prettier for the monorepo
- [X] T005 Add package dependencies: `@simplewebauthn/server` to `packages/rp-server`, `@simplewebauthn/browser` to `packages/user-client`, `canonicalize` to `packages/shared` (research.md §2/§3)

---

## Phase 2: WebAuthn Conformance Spike (Gate) 🚧

**Purpose**: Empirically validate, before any further grant-flow implementation, that ceremony
two's digest-as-challenge approach (research.md §1) is conformant — or confirm which documented
fallback is needed.

**⚠️ CRITICAL**: Per Constitution Principle II (NON-NEGOTIABLE) and spec.md's Clarifications
(resolves OQ-1), no Foundational, US1, US2, or US3 work may begin until this task's outcome is
recorded. This is a hard gate, not a polish item.

- [X] T006 Build a minimal standalone prototype using `@simplewebauthn/browser`'s `startAuthentication()` with a locally-computed challenge (no fresh server call between a simulated ceremony one and ceremony two) against a real browser + virtual/platform authenticator; confirm whether the primary approach (research.md §1 Decision) is accepted as specified, or whether its documented fallback (a purely confirmatory RP round-trip echoing the already-computed digest) is required. Record the outcome in `specs/001-grant/research.md` §1 (depends on T005) — **DONE**: implemented as a Playwright + CDP-virtual-authenticator harness in `spikes/001-grant-webauthn-conformance/` (not `@simplewebauthn/browser` directly, since the question under test is the raw WebAuthn API's challenge-acceptance behavior); PASS, primary approach confirmed, see research.md §1 Outcome

**Checkpoint**: Conformance approach confirmed (or fallback selected) — grant-flow implementation may now begin

---

## Phase 3: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 [P] Define `Credential` TypeScript type in `packages/shared/src/credential.ts` per data-model.md "Entity: Credential" (identity/scope/temporal/integrity blocks)
- [X] T008 [P] Define `GrantRecord` TypeScript type (including the `status`/`consumedAt` state-machine fields) in `packages/shared/src/grant-record.ts` per data-model.md "Entity: Grant Record" and plan.md's Project Structure
- [X] T009 Implement JCS canonicalization + SHA-256 digest wrapper `computeCredentialDigest()` in `packages/shared/src/canonicalize.ts`, serializing exactly `{identity, scope, temporal, assuranceLevel, grantNonce}` per FR-021/data-model.md digest computation (depends on T007, T005's `canonicalize` dependency)
- [X] T010 [P] Implement `GrantRecordStore` (in-memory `Map` keyed by nonce) in `packages/rp-server/src/models/grant-record-store.ts`, with an atomic `retrieveForVerification()` method that sets `consumedAt` immediately upon retrieval, before returning the record to any caller (FR-014/FR-015, Constitution Principle V — NON-NEGOTIABLE) (depends on T008)
- [X] T011 [P] Implement `AssuranceCeilingPolicy` in `packages/rp-server/src/models/assurance-ceiling-policy.ts` with a POC-reasonable default `ceilings` map (FR-007a, data-model.md "Entity: Assurance Ceiling Policy")
- [X] T012 Implement WebAuthn helper wrappers (`generateAuthenticationOptions`, `verifyAuthenticationResponse`) around `@simplewebauthn/server` in `packages/rp-server/src/services/webauthn.ts` (depends on T005)
- [X] T013 Implement a passkey-registration seed/bootstrap helper (bypasses the out-of-scope registration ceremony) in `packages/rp-server/src/services/seed.ts`, used by quickstart.md's Setup step — also added `models/registered-passkey-store.ts` and `services/cose-key.ts` as supporting pieces (not separately tracked in tasks.md, needed to make T012/T013 concrete)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 4: User Story 1 - User Grants a Temporal Credential to an Agent (Priority: P1) 🎯 MVP

**Goal**: A User authorizes a specific Agent at a specific RP, for an agreed scope and duration,
via two passkey ceremonies bound by a single RP-issued nonce, ending in an `active` Grant Record.

**Independent Test**: Run the flow end-to-end (authenticate → negotiate → nonce issuance → Agent
keypair generation → sign credential → present → RP activates) and confirm the RP's persisted
record reaches status `active` with the correct scope, duration, and assurance level.

### Tests for User Story 1

- [X] T014 [P] [US1] Contract test for `GET /grant/authenticate/options` per contracts/grant-api.yaml in `packages/rp-server/tests/contract/authenticate-options.test.ts` — passing, over real HTTP against an ephemeral-port server instance (required extracting `src/app.ts` out of `index.ts` so tests can construct an isolated instance; not separately tracked in tasks.md)
- [X] T015 [P] [US1] Contract test for `POST /grant/negotiate` (response omits nothing the contract requires; `rpIdentifier` present) per contracts/grant-api.yaml in `packages/rp-server/tests/contract/negotiate.test.ts` — passing
- [X] T016 [P] [US1] Contract test for `POST /grant/activate` happy path per contracts/grant-api.yaml in `packages/rp-server/tests/contract/activate.test.ts` — passing, full real-HTTP flow (options → negotiate → activate)
- [X] T017 [US1] Integration test for the full grant flow (spec.md US1 Independent Test) in `packages/rp-server/tests/integration/full-grant-flow.test.ts`, asserting the Grant Record reaches `active` with the correct scope/duration/assurance level (SC-005) — passing
- [X] T018 [P] [US1] Integration test asserting the Agent's private key never appears in any outbound payload (negotiate request/response, activate request) or RP-side storage, at any point in the flow (SC-006, Constitution Principle VII) in `packages/agent-client/tests/integration/private-key-never-observed.test.ts` — passing (asserts non-extractability rather than sniffing traffic, which is the stronger guarantee)

### Implementation for User Story 1

- [X] T019 [US1] Implement negotiation service in `packages/rp-server/src/services/negotiation-service.ts`: verify ceremony-one assertion (via T012), derive assurance level from UP/UV signals (FR-006), negotiate scope/duration bounded by the ceiling policy (FR-007/FR-007a via T011), create a `pending` Grant Record (FR-010 via T010) with `nonceIssuedAt`/`nonceExpiresAt` set to a 5-minute default window — RP-overridable — and validated as strictly shorter than the negotiated credential's `validFrom`/`validUntil` window (FR-012) (depends on T010, T011, T012)
- [X] T020 [US1] Implement `GET /grant/authenticate/options` endpoint in `packages/rp-server/src/api/authenticate-options.ts` (depends on T012) — also added `models/pending-challenge-store.ts` to bridge ceremony one's two round-trips (not separately tracked in tasks.md)
- [X] T021 [US1] Implement `POST /grant/negotiate` endpoint in `packages/rp-server/src/api/negotiate.ts`, returning `{nonce, agreedScope, agreedDuration, assuranceLevel, rpIdentifier, nonceExpiresAt}` per contracts/grant-api.yaml (depends on T019)
- [X] T022 [P] [US1] Implement Agent keypair generation (WebCrypto ECDSA P-256, one keypair per RP) in `packages/agent-client/src/keypair/generate-keypair.ts`, accepting only `rpIdentifier` as input — no scope/duration parameter exists on this function's signature (FR-017/FR-018/FR-018a, research.md §4)
- [X] T023 [P] [US1] Implement Credential assembly in `packages/agent-client/src/credential/assemble-credential.ts`, building the `identity`/`scope`/`temporal` blocks from the negotiated terms plus the Agent's public key (FR-019), and assembling the pre-signature `integrity` fields (`grantNonce`, `assuranceLevel`) from the negotiate response so they are present before digest computation (FR-008) (depends on T007)
- [X] T024 [US1] Implement the ceremony-one client flow (fetch options, authenticate, negotiate) in `packages/user-client/src/ceremonies/ceremony-one.ts` (depends on T020, T021) — this is the real browser-facing implementation using `@simplewebauthn/browser`; the demo (T028) uses a separate Node-compatible path since `navigator.credentials` doesn't exist outside a browser
- [X] T025 [US1] Implement the ceremony-two client flow in `packages/user-client/src/ceremonies/ceremony-two.ts`: compute the JCS digest (via T009) and complete `navigator.credentials.get()` with that digest as `challenge`, per the approach confirmed in T006, with no additional network call to `rp-server` between ceremony one and ceremony two (FR-003/FR-004/FR-005, research.md §1) (depends on T006, T009, T023)
- [X] T026 [US1] Implement credential-validation service in `packages/rp-server/src/services/credential-validation-service.ts`: retrieve-and-consume the nonce (via T010's `retrieveForVerification()`), verify the User signature over the JCS digest (via T009), account match, terms match, and assurance match (FR-009/FR-011) (depends on T009, T010) — implemented together with T034's atomicity guarantee and T039/T040's expiry/consumption-ordering checks in a single pass (see those checkboxes)
- [X] T027 [US1] Implement `POST /grant/activate` endpoint (happy-path wiring) in `packages/rp-server/src/api/activate.ts`, transitioning the Grant Record to `active` on full success (FR-011) (depends on T026)
- [X] T028 [US1] Wire the end-to-end demo scripts referenced by quickstart.md Scenario 1 (`demo:negotiate`, `demo:keypair`, `demo:sign`) in `packages/user-client/src/demo/` and `packages/agent-client/src/demo/` — manually run end-to-end against a live rp-server; caught and fixed two real bugs in the process (grant-record-store.ts's `retrieveForVerification` wasn't actually rejecting replays of already-consumed nonces — see FR-014/FR-015 fix; and `sign.ts` wasn't persisting the WebAuthn signature counter between demo steps, breaking ceremony continuity)

**Checkpoint**: User Story 1 fully functional and testable independently — this is the MVP

---

## Phase 5: User Story 2 - Grant Attempt Aborts Cleanly on Any Validation Failure (Priority: P1)

**Goal**: Any single failed check during credential presentation (account-lookup miss, invalid
signature, nonce mismatch, terms mismatch) aborts the grant attempt entirely, with no record
persisted or activated as a side effect.

**Independent Test**: Seed a `pending` Grant Record directly (without running User Story 1's full
negotiation) and present it with each category of invalid credential in turn; confirm none result
in an `active` record and no new record is created as a byproduct of the failed attempt.

### Tests for User Story 2

- [X] T029 [P] [US2] Integration test: account-lookup mismatch aborts the attempt, record stays `pending` in `packages/rp-server/tests/integration/abort-account-mismatch.test.ts` — passing
- [X] T030 [P] [US2] Integration test: invalid signature aborts the attempt, record stays `pending` in `packages/rp-server/tests/integration/abort-invalid-signature.test.ts` — passing
- [X] T031 [P] [US2] Integration test: nonce mismatch aborts the attempt, record stays `pending` in `packages/rp-server/tests/integration/abort-nonce-mismatch.test.ts` — passing
- [X] T032 [P] [US2] Integration test: scope/duration/assurance-level terms mismatch aborts the attempt, record stays `pending` in `packages/rp-server/tests/integration/abort-terms-mismatch.test.ts` — passing (2 cases: scope inflation, duration extension)
- [X] T033 [US2] Integration test asserting no additional Grant Record is created and no record transitions to `active` as a side effect, across all four failure categories above (SC-003) in `packages/rp-server/tests/integration/abort-no-side-effects.test.ts` — passing

### Implementation for User Story 2

- [X] T034 [US2] Harden `credential-validation-service.ts` (T026) so the `active` transition is a single explicit write gated on all checks having passed, with no partial-state writes on any failure path, in `packages/rp-server/src/services/credential-validation-service.ts` — done as part of T026's original implementation; verified by T033
- [X] T035 [US2] Add explicit rejection-reason responses (account mismatch, signature invalid, nonce mismatch, terms mismatch → 409/422 per contracts/grant-api.yaml — `/grant/activate` has no 401 response; that code is only defined under `/grant/negotiate`) to `POST /grant/activate` in `packages/rp-server/src/api/activate.ts` — done as part of T027's original implementation

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 6: User Story 3 - Grant Nonce Is Provably Single-Use (Priority: P1)

**Goal**: The grant-time nonce, once retrieved for verification, cannot be redeemed a second time —
whether the first presentation succeeded or failed a later check — and cannot be redeemed at all
once its bounded validity window has elapsed.

**Independent Test**: Seed a `pending` Grant Record with a known nonce; attempt to redeem it twice
under each of three conditions (first attempt succeeds, first attempt fails a downstream check,
nonce's validity window has elapsed) and confirm the second attempt is always rejected.

### Tests for User Story 3

- [X] T036 [P] [US3] Integration test: replaying an already-successfully-redeemed nonce is rejected (SC-002/SC-007) in `packages/rp-server/tests/integration/replay-after-success.test.ts` — passing (this test caught a real bug: `retrieveForVerification` wasn't actually rejecting replays before the fix noted at T040)
- [X] T037 [P] [US3] Integration test: replaying a nonce whose first presentation failed a downstream check is rejected on the second attempt, even within the validity window (FR-014/FR-015) in `packages/rp-server/tests/integration/replay-after-failure.test.ts` — passing
- [X] T038 [P] [US3] Integration test: a nonce presented after its validity window elapses is rejected and the Grant Record transitions to `expired`, not `active` (SC-010) in `packages/rp-server/tests/integration/nonce-expiry.test.ts` — passing

### Implementation for User Story 3

- [X] T039 [US3] Implement the nonce-expiry check and `pending`→`expired` transition (FR-013) in `packages/rp-server/src/services/credential-validation-service.ts` (depends on T010) — done as part of T026's original implementation; verified by T038
- [X] T040 [US3] Audit and enforce that `consumedAt` is set inside `GrantRecordStore.retrieveForVerification()` strictly before any signature/terms/account check is dispatched (FR-014, Constitution Principle V) in `packages/rp-server/src/models/grant-record-store.ts` and `packages/rp-server/src/services/credential-validation-service.ts` — **this audit caught a real bug**: the original implementation returned the record on retrieval regardless of whether it was already consumed, so a second retrieval of an already-consumed nonce was still handed to the caller as if valid; replay rejection was accidentally happening only via WebAuthn's own signature-counter monotonicity check, not the grant-nonce layer FR-016 requires. Fixed in `grant-record-store.ts`: `retrieveForVerification()` now returns `undefined` for an already-consumed nonce. Manually caught during end-to-end demo testing (T028) and confirmed by T036's test.

**Checkpoint**: All three user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T041 [P] Run quickstart.md's three validation scenarios end-to-end against the completed implementation — all three now have automated equivalents (25/25 tests passing); quickstart.md rewritten to reflect the actual software-authenticator-based approach rather than the originally-planned live-browser-per-scenario flow (T006's spike is the one place a real browser was actually required)
- [X] T042 [P] Add unit tests for JCS canonicalization edge cases (key ordering, number formatting, `-0`, exponent forms) in `packages/shared/tests/unit/canonicalize.test.ts` — passing
- [X] T043 [P] Add unit tests for `AssuranceCeilingPolicy` boundary conditions (at-ceiling, over-ceiling durations) in `packages/rp-server/tests/unit/assurance-ceiling-policy.test.ts` — passing
- [X] T044 [P] Document environment/config variables (nonce window override, RP identifier, ceiling policy values) in `README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **WebAuthn Conformance Spike (Phase 2)**: Depends on Setup (needs `@simplewebauthn/browser` installed, T005) — BLOCKS Foundational and every user story (Constitution Principle II gate)
- **Foundational (Phase 3)**: Depends on Phase 2's gate being satisfied — BLOCKS all user stories
- **User Story 1 (Phase 4)**: Depends on Foundational completion — no dependency on US2/US3
- **User Story 2 (Phase 5)**: Depends on Foundational completion; its implementation tasks modify code US1 created (T026/`activate.ts`), so in practice run after US1
- **User Story 3 (Phase 6)**: Depends on Foundational completion; likewise builds on US1's `credential-validation-service.ts` and `grant-record-store.ts`
- **Polish (Phase 7)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no dependency on other stories; this is the MVP
- **User Story 2 (P1)**: Independently testable via direct Grant Record seeding (per its Independent Test), but its implementation tasks (T034/T035) edit files US1 created — sequence after US1 in a single-developer flow
- **User Story 3 (P1)**: Independently testable via direct Grant Record seeding, same file-sharing consideration as US2 — sequence after US1 (and may run in parallel with US2 by a second developer, since T039/T040 touch different concerns within the same two files)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types/models before services
- Services before endpoints
- Core implementation before integration/demo wiring

### Parallel Opportunities

- All Setup tasks marked [P] (T003, T004) can run in parallel
- Foundational tasks marked [P] (T007, T008, T010, T011) can run in parallel; T009 depends on T007, T012 depends on T005
- All US1 contract/integration tests (T014–T018) can run in parallel; T022/T023 (agent-client tasks) can run in parallel with each other and with the rp-server tasks
- All US2 tests (T029–T032) can run in parallel
- All US3 tests (T036–T038) can run in parallel
- Most Polish tasks (T041–T044) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Contract test for GET /grant/authenticate/options in packages/rp-server/tests/contract/authenticate-options.test.ts"
Task: "Contract test for POST /grant/negotiate in packages/rp-server/tests/contract/negotiate.test.ts"
Task: "Contract test for POST /grant/activate happy path in packages/rp-server/tests/contract/activate.test.ts"
Task: "Integration test asserting the Agent's private key never appears in any outbound payload in packages/agent-client/tests/integration/private-key-never-observed.test.ts"

# Launch independent agent-client tasks together:
Task: "Implement Agent keypair generation in packages/agent-client/src/keypair/generate-keypair.ts"
Task: "Implement Credential assembly in packages/agent-client/src/credential/assemble-credential.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: WebAuthn Conformance Spike (CRITICAL gate — confirms or redirects the ceremony-two approach before any code depending on it is written)
3. Complete Phase 3: Foundational (CRITICAL — blocks all stories)
4. Complete Phase 4: User Story 1
5. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently
6. Demo if ready — this is the entire protocol's happy path (spec.md: "this is the entire feature")

### Incremental Delivery

1. Complete Setup + Conformance Spike + Foundational → Foundation ready
2. Add User Story 1 → validate via quickstart.md Scenario 1 (MVP!)
3. Add User Story 2 → validate via quickstart.md Scenario 2
4. Add User Story 3 → validate via quickstart.md Scenario 3
5. Each story adds a further correctness guarantee without breaking the previous ones

### Parallel Team Strategy

With multiple developers, after the Conformance Spike and Foundational are done:

- Developer A: User Story 1 (must land first — US2/US3 build on its files)
- Developer B: prep User Story 2's tests (T029–T033) against a stubbed/seeded Grant Record while
  US1 lands, then implement T034/T035 once US1's `activate.ts`/`credential-validation-service.ts`
  exist
- Developer C: same pattern for User Story 3 (T036–T040)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All three user stories are P1; US2 and US3 are independently *testable* (via direct Grant
  Record seeding, per their Independent Test descriptions) but not independently *implementable*
  ahead of US1, since they harden and add coverage to the same `activate` endpoint and
  `GrantRecordStore` US1 creates
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- T006 (Phase 2) is a required empirical check, not a formality — research.md §1 documents a
  design-time conformance analysis and a fallback; this task is where that analysis gets confirmed
  (or the fallback gets triggered) against real browser/authenticator behavior, and it MUST
  complete before T025 (and, per Constitution Principle II, before Foundational/US1/US2/US3
  generally) is implemented
