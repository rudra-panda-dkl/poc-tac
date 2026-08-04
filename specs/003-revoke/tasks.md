---

description: "Task list template for feature implementation"
---

# Tasks: TAC Grant Revocation Flow (Feature 3 of 3)

**Input**: Design documents from `/specs/003-revoke/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/revoke-api.yaml, quickstart.md (all present)

**Tests**: Included. spec.md structures every user story around an explicit "Independent Test"
and numbered Acceptance Scenarios, and several Success Criteria (SC-001, SC-002, SC-005) are
themselves pass/fail assertions over Constitution NON-NEGOTIABLE principles (V: consumption
ordering) and the load-bearing Principle VIII synchronicity claim this feature exists to prove —
this feature's correctness is defined in terms of tests passing, so test tasks are included
rather than treated as optional.

**Organization**: Tasks are grouped by user story. All three of this feature's user stories are
P1 (spec.md: US1 is "the entire reason revocation exists"; US2 and US3 validate
constitution-load-bearing guarantees that must hold as reliably as the happy path) — ordered
US1 → US2 → US3 as spec.md presents them. US2 and US3 are independently *testable* (per their own
Independent Test descriptions, by seeding Grant Records directly) but their implementation tasks
harden the same `RevocationService`/endpoints US1 creates, so in practice they land after US1,
mirroring 001-grant's and 002-transact's own precedent.

**No conformance-spike gate**: like 002-transact (and unlike 001-grant), this feature introduces
no new WebAuthn ceremony *shape* — it reuses ceremony one's already-validated mechanism unchanged
(research.md §1) — so there is no equivalent to 001-grant's Phase 2 empirical-validation gate.

**Central premise, verified before planning began, re-verified in Polish**: this feature's
Constitution Principle VIII compliance rests on 002-transact's `TransactionService` needing ZERO
code changes (FR-012, research.md §5). That claim was confirmed by direct source inspection
before `/speckit-plan` ran (see the conversation record), and T034 in this file re-confirms it
mechanically once implementation is done — if any US1-US3 task is tempted to edit
`transaction-service.ts`, that is a signal to stop and revisit the plan, not to proceed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Per plan.md's Project Structure (extends 001-grant's/002-transact's npm-workspaces monorepo — no
new package):

```text
packages/shared/src/
packages/rp-server/{src/{models,services,api},tests/{contract,integration,unit}}/
packages/user-client/{src/{ceremonies,demo},tests/{unit,integration}}/
```

No source file inside `packages/agent-client/` is modified by this feature — the Agent has no
role in revocation (spec.md Edge Cases, research.md §6). This is the inverse of 002-transact's
package split, which touched `agent-client` and left `user-client` untouched.

---

## Phase 1: Setup

**Purpose**: Confirm no new scaffolding is required

**No new dependencies, packages, or directories** (research.md §7): every directory this feature
needs (`rp-server/{src/{models,services,api},tests/{contract,integration,unit}}`,
`user-client/src/{ceremonies,demo}`, `user-client/tests/{unit,integration}`) already exists from
001-grant/002-transact, and `@simplewebauthn/server`/`@simplewebauthn/browser` are already
dependencies of `rp-server`/`user-client` respectively.

- [X] T001 [P] Verify `packages/rp-server/src/{models,services,api}`, `packages/rp-server/tests/{contract,integration,unit}`, `packages/user-client/src/{ceremonies,demo}`, and `packages/user-client/tests/{unit,integration}` already exist and require no new subdirectories or `package.json` dependency entries for this feature (research.md §7)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Add `"revoked"` to `GrantRecordStatus` in `packages/shared/src/grant-record.ts` (currently `"pending" | "active" | "expired"`), per data-model.md "Entity: Grant Record" and FR-010 — the one place this feature extends 001-grant's data (research.md §4); 001-grant's own docblock already reserved this exact extension point
- [X] T003 Add `GrantRecordStore.transitionToRevoked(nonce)` in `packages/rp-server/src/models/grant-record-store.ts`, mirroring `transitionToActive`/`transitionToExpired`'s exact shape (mutate `record.status` in place on the object already held in the store's `Map`) (research.md §4/§5, depends on T002 for the type to accept `"revoked"`)
- [X] T004 [P] Implement `RevocationChallengeStore` (in-memory `Map` keyed by `challengeId`) in `packages/rp-server/src/models/revocation-challenge-store.ts`, with an atomic `retrieveForVerification()` method that sets `consumedAt` immediately upon retrieval, before returning the record to any caller (FR-007/FR-008, Constitution Principle V — NON-NEGOTIABLE), storing `{challengeId, challenge, grantNonce, issuedAt, expiresAt, consumedAt}` per data-model.md "Entity: Revocation Challenge" — deliberately a separate `Map` from both `GrantRecordStore` and `TransactionChallengeStore`, sharing no storage or consumption logic with either (FR-009, research.md §3)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - User Revokes an Active Grant and Future Transactions Are Immediately Denied (Priority: P1) 🎯 MVP

**Goal**: The User authenticates via a single WebAuthn ceremony to revoke a specific `active`
Grant; the RP transitions it to `revoked` and confirms; every subsequent transaction attempt
against it — including one already mid-flight — is denied by 002-transact's existing,
unmodified Grant-state gate.

**Independent Test**: Seed an `active` Grant Record (as 001-grant would produce), revoke it via a
properly-authenticated request, and confirm both (a) the RP returns a revoked acknowledgment and
the Grant Record's status is `revoked`, and (b) an immediately-following transaction request
against that Grant (via 002-transact) is denied.

### Tests for User Story 1

- [X] T005 [P] [US1] Contract test for `POST /revoke/request` happy path per contracts/revoke-api.yaml in `packages/rp-server/tests/contract/revoke-request.test.ts`
- [X] T006 [P] [US1] Contract test for `POST /revoke/respond` happy path per contracts/revoke-api.yaml in `packages/rp-server/tests/contract/revoke-respond.test.ts`
- [X] T007 [P] [US1] Integration test for the full revocation flow (spec.md US1 Independent Test, Acceptance Scenario 1): seed an `active` Grant Record, revoke it, and confirm `{status: "revoked", grantNonce}` plus the Grant Record's `status` field reads `"revoked"` (SC-001) in `packages/rp-server/tests/integration/full-revocation-flow.test.ts` — backed by a new `packages/rp-server/tests/integration/revocation-test-helpers.ts` (not separately tracked as its own task), which drives 001-grant's real negotiate→activate flow using the same software-authenticator signer 002-transact's own `transaction-test-helpers.ts` already depends on, so the revocation signature is real, not stubbed. Uses a plain random Agent public key rather than a real `@tac/agent-client` keypair (revocation never signs against it, unlike `transaction-test-helpers.ts`'s own need for a real one)
- [X] T008 [P] [US1] Integration test: immediately after a successful revocation, a `TransactionService.request()` call against the same `grantNonce` is denied (Acceptance Scenario 2, SC-002) in `packages/rp-server/tests/integration/transaction-denied-after-revocation.test.ts`
- [X] T009 [P] [US1] Integration test: a transaction challenge issued via `TransactionService.request()` *before* revocation, but responded to via `TransactionService.respond()` *after* revocation completes, is denied (Acceptance Scenario 3) — this is the specific mid-flight case research.md §5's "zero new code" claim depends on; in `packages/rp-server/tests/integration/transaction-denied-mid-flight-revocation.test.ts` — passed on first run, with a garbage signature, confirming the respond-time Grant-state re-check (not signature verification) is what catches this case, exactly as research.md §5 predicted

### Implementation for User Story 1

- [X] T010 [US1] Implement `RevocationService` request path in `packages/rp-server/src/services/revocation-service.ts`: look up the Grant Record by `grantNonce` (FR-001), evaluate the Grant-state gate — `status === "active"` (FR-002) — and on pass, issue a fresh `RevocationChallenge` via `buildAuthenticationOptions()` scoped to the Grant owner's specific registered credential (`allowedCredentialId`, resolved via `RegisteredPasskeyStore.getByAccountId(record.userPublicKeyRef)`), recording the returned challenge bound to this `grantNonce` (FR-003, research.md §2) (depends on T003, T004)
- [X] T011 [US1] Extend `RevocationService` with the respond path in `packages/rp-server/src/services/revocation-service.ts`: retrieve-and-consume the challenge (via T004's `retrieveForVerification()`, FR-007), re-check the target Grant Record (read from `challenge.grantNonce`, never from the request body) is still `active` (data-model.md validation rule, mirrors 002-transact's respond-time re-check, research.md §5), verify the WebAuthn assertion via `verifyAssertion()` against the passkey registered for that owner (FR-005), update the passkey's signature counter on success (mirrors `negotiation-service.ts`'s own pattern), and transition the Grant Record via `transitionToRevoked()` (FR-010) (depends on T010, T003)
- [X] T012 [US1] Implement `POST /revoke/request` endpoint in `packages/rp-server/src/api/revoke-request.ts`, returning `{challengeId, options}` per contracts/revoke-api.yaml (depends on T010)
- [X] T013 [US1] Implement `POST /revoke/respond` endpoint in `packages/rp-server/src/api/revoke-respond.ts`, returning `{status: "revoked", grantNonce}` per contracts/revoke-api.yaml (FR-011) (depends on T011)
- [X] T014 [US1] Wire both new endpoints into routing in `packages/rp-server/src/app.ts`'s `createApp()`, instantiating `RevocationChallengeStore` and `RevocationService` alongside the existing stores/services (depends on T012, T013)
- [X] T015 [P] [US1] Implement the User-facing revocation ceremony client `runRevocation()` in `packages/user-client/src/ceremonies/revoke.ts`: `POST /revoke/request` → `startAuthentication(options)` → `POST /revoke/respond` — same shape as `ceremonies/ceremony-one.ts`'s `runCeremonyOne()` (research.md §6)
- [X] T016 [US1] Wire an end-to-end demo script in `packages/user-client/src/demo/revoke.ts` (depends on T014, T015): negotiates and activates a fresh grant, revokes it, then attempts a transaction against it via `/transact/request` and confirms denial; add a `demo:revoke` script to `packages/user-client/package.json` — **does not call T015's `runRevocation()`**: like `demo/negotiate.ts`/`demo/sign.ts` relative to `ceremony-one.ts`/`ceremony-two.ts`, `runRevocation()` calls `startAuthentication()`, which requires a real browser; the demo instead replicates the same protocol steps inline using the Node-compatible software-authenticator signer, and generates its own throwaway Agent keypair (inert data for revocation purposes) rather than depending on `@tac/agent-client`. Manually verified against a live `rp-server`: negotiate → activate → revoke → denied transaction, exit 0

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently — this is the MVP

---

## Phase 4: User Story 2 - RP Denies Revocation Attempts That Aren't Properly Authenticated or Scoped (Priority: P1)

**Goal**: Any single failed check — a target Grant that isn't `active`, a revocation challenge
misapplied across grants, or an invalid signature — causes the RP to deny the revocation attempt,
with no Grant Record's status changed as a side effect.

**Independent Test**: Seed Grant Records in each denial-worthy state in turn (`pending`,
`expired`, already-`revoked`) and confirm every revocation attempt against them is denied;
separately, seed two distinct active Grant Records for the same User and confirm a revocation
challenge issued for one cannot revoke the other, and confirm an invalid signature is denied.

### Tests for User Story 2

- [X] T017 [P] [US2] Integration test: Grant status `pending` → `/revoke/request` denies with no challenge issued (SC-003) in `packages/rp-server/tests/integration/deny-revoke-grant-pending.test.ts`
- [X] T018 [P] [US2] Integration test: Grant status `expired` → denies with no challenge issued (SC-003) in `packages/rp-server/tests/integration/deny-revoke-grant-expired.test.ts`
- [X] T019 [P] [US2] Integration test: Grant status already `revoked` → denies with no challenge issued, status remains `revoked` (SC-003) in `packages/rp-server/tests/integration/deny-revoke-already-revoked.test.ts`
- [X] T020 [P] [US2] Integration test: an unknown/bogus `grantNonce` → denies identically to a not-active Grant (spec.md Edge Cases) in `packages/rp-server/tests/integration/deny-revoke-unknown-grant-reference.test.ts`
- [X] T021 [P] [US2] Integration test: two active Grant Records (A and B) for the same User each get their own revocation challenge; presenting a signature produced over Grant A's challenge value under Grant B's `challengeId` (or any other cross-challenge substitution) is denied, and neither Grant Record's status changes (Acceptance Scenario 2, SC-004) in `packages/rp-server/tests/integration/cross-grant-revocation-replay.test.ts` — backed by `activateGrantOnContext()` (`revocation-test-helpers.ts`), which activates a second grant against an already-existing test context, since `transaction-test-helpers.ts`'s `activateTestGrant()` always builds a fresh one
- [X] T022 [P] [US2] Integration test: a missing or invalid signature presented to `/revoke/respond` against an otherwise-valid, unexpired challenge is denied (Acceptance Scenario 3, SC-004) in `packages/rp-server/tests/integration/deny-revoke-invalid-signature.test.ts` — uses the established `flipOneChar()` pattern from `abort-invalid-signature.test.ts` (corrupt a real signature, not construct a fake one) for parity with 001-grant's own precedent
- [X] T023 [US2] Integration test asserting none of the denial categories above transition any Grant Record's status or leave a `RevocationChallenge` issued-but-unconsumed after a request-time denial in `packages/rp-server/tests/integration/deny-revoke-no-side-effects.test.ts`

### Implementation for User Story 2

- [X] T024 [US2] Harden `RevocationService`'s Grant-state gate (T010) to deny distinctly for `pending`/`expired`/`revoked` while collapsing an unknown/bogus `grantNonce` reference into the same generic denial (spec.md FR-002/Edge Cases) in `packages/rp-server/src/services/revocation-service.ts` — already satisfied by T010/T011's original implementation (all 8 US2 tests, including cross-grant replay, pass against it unmodified); no code change was needed here beyond what US1 already built
- [X] T025 [US2] Add explicit denial-reason → HTTP status mapping (403 for the Grant-state gate and its respond-time re-check; 409 for challenge conflict/expiry; 422 for signature failure) per contracts/revoke-api.yaml to `packages/rp-server/src/api/revoke-request.ts` and `revoke-respond.ts` — likewise already in place from T012/T013's original implementation, verified by the contract/integration tests above

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Revocation Challenge Is Provably Single-Use (Priority: P1)

**Goal**: The revocation challenge, once retrieved for verification, cannot be redeemed a second
time — whether the first presentation succeeded or failed a later check — and this replay
protection is distinct from, and independently verifiable of, both 001-grant's grant-time nonce
layer and 002-transact's transaction-time challenge layer.

**Independent Test**: Issue a revocation challenge, redeem it once (successfully or with a
failing downstream check), then attempt to redeem the same challenge a second time and confirm it
is always rejected — including when the corresponding Grant Record's own grant-nonce (001-grant)
and any of its transaction challenges (002-transact) are untouched by this replay.

### Tests for User Story 3

- [X] T026 [P] [US3] Integration test: replaying an already-successfully-redeemed `challengeId` is rejected (SC-005) in `packages/rp-server/tests/integration/revocation-replay-after-success.test.ts`
- [X] T027 [P] [US3] Integration test: a challenge first presented with an invalid signature, then retried with a corrected, validly-signed response under the same `challengeId`, is still rejected — because `consumedAt` was set at first retrieval, not at first success (FR-007/FR-008, User Story 3 Scenario 2) in `packages/rp-server/tests/integration/revocation-replay-after-failure.test.ts`
- [X] T028 [P] [US3] Integration test: a challenge presented after its own `expiresAt` has elapsed is rejected, mirroring 002-transact's `challenge_expired` handling in `packages/rp-server/tests/integration/revocation-challenge-expiry.test.ts`
- [X] T029 [P] [US3] Integration test: redeeming a revocation challenge does not touch or consume the Grant Record's own grant-time `nonce`/`consumedAt` (001-grant) nor any `TransactionChallengeStore` entry (002-transact), confirming FR-009's three-way storage independence in `packages/rp-server/tests/integration/revocation-challenge-independent-from-other-layers.test.ts` (3 sub-tests: grant-nonce untouched, transaction challenge untouched, separate keyspaces)
- [X] T030 [P] [US3] Unit test for `RevocationChallengeStore.retrieveForVerification()`'s atomicity: a second retrieval of the same `challengeId` always returns `undefined`, regardless of the first attempt's downstream outcome, in `packages/rp-server/tests/unit/revocation-challenge-store.test.ts`

### Implementation for User Story 3

- [X] T031 [US3] Implement the challenge-expiry check in `RevocationService`'s respond path (T011): a retrieved-but-expired challenge is treated as consumed but fails the revocation, distinct from "not found" (data-model.md validation rules) in `packages/rp-server/src/services/revocation-service.ts` — already satisfied by T011's original implementation; verified by T028
- [X] T032 [US3] Audit `RevocationChallengeStore.retrieveForVerification()` (T004) to confirm `consumedAt` is set strictly before the caller evaluates any other check — deliberately re-verify this holds in this third, independent store rather than assuming it does, since both prior features' equivalent methods needed exactly this fix at least once (see specs/001-grant/quickstart.md's Scenario 3 note) — audited: T004's implementation already sets `consumedAt` synchronously inside `retrieveForVerification()` before returning, mirroring both prior stores' (now-proven-correct) shape exactly; no bug found this time, confirmed by T026/T027/T030

**Checkpoint**: All three user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T033 [P] Run quickstart.md's three validation scenarios end-to-end against the completed implementation, and manually run `demo:revoke` against a live `rp-server` to confirm the negotiate → activate → revoke → denied-transaction chain works outside the test suite — all three scenarios have automated equivalents (82/82 tests passing across the monorepo); manual run confirmed: `Grant activated` → `Grant revoked` → `Transaction attempt after revocation: 403 {"error":"grant_not_active"}` → `Confirmed: transaction denied after revocation.`, exit 0
- [X] T034 [P] Confirm `packages/rp-server/src/services/transaction-service.ts` has zero diff from its pre-003-revoke state, and that 002-transact's full existing test suite passes unmodified — **note**: no commit exists between 002-transact's completion and 003-revoke's start (both are uncommitted atop the `001-grant` commit), so a `git diff` against a branch point isn't meaningful here; verified instead by (a) this session's own tool-call record, which never issued an Edit/Write against this file, and (b) reading its full current contents and confirming byte-for-byte identity with the version quoted verbatim earlier in this conversation, including `evaluateActiveAndWindow()`'s unchanged `record.status !== "active"` check — the load-bearing verification of FR-012/research.md §5's central premise
- [X] T035 [P] Document the revocation-challenge window default/override and the `GrantRecordStatus` `"revoked"` addition in `README.md`, following the same pattern used for the grant-nonce and transaction-challenge windows — also updated "Project layout" (all four packages' 003-revoke changes) and "Known gaps" (003-revoke's own boundary, and that this closes all three planned features)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational completion; its implementation tasks modify
  code US1 created (T010/`revocation-service.ts`, T012–T013/API handlers), so in practice run
  after US1
- **User Story 3 (Phase 5)**: Depends on Foundational completion; likewise builds on US1's
  `revocation-service.ts` and T004's `revocation-challenge-store.ts`
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no dependency on other stories; this is
  the MVP
- **User Story 2 (P1)**: Independently testable via direct Grant Record seeding (per its
  Independent Test), but its implementation tasks (T024/T025) edit files US1 created — sequence
  after US1 in a single-developer flow
- **User Story 3 (P1)**: Independently testable via direct challenge seeding, same file-sharing
  consideration as US2 — sequence after US1 (and may run in parallel with US2 by a second
  developer, since T031/T032 touch different concerns within largely the same files)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types/models before services
- Services before endpoints
- Core implementation before demo/integration wiring

### Parallel Opportunities

- T001 (Setup) has nothing to block on
- Foundational tasks marked [P] (T002, T004) can run in parallel; T003 depends on T002
- All US1 tests (T005–T009) can run in parallel; T015 (user-client) can run in parallel with the
  rp-server implementation tasks (T010–T014) until T016 needs both
- All US2 tests (T017–T022) can run in parallel
- All US3 tests (T026–T030) can run in parallel
- All Polish tasks (T033–T035) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Contract test for POST /revoke/request in packages/rp-server/tests/contract/revoke-request.test.ts"
Task: "Contract test for POST /revoke/respond in packages/rp-server/tests/contract/revoke-respond.test.ts"
Task: "Integration test for the full revocation flow in packages/rp-server/tests/integration/full-revocation-flow.test.ts"
Task: "Integration test: transaction denied after revocation in packages/rp-server/tests/integration/transaction-denied-after-revocation.test.ts"
Task: "Integration test: transaction denied mid-flight in packages/rp-server/tests/integration/transaction-denied-mid-flight-revocation.test.ts"

# Launch independent implementation tasks together:
Task: "Implement the User-facing revocation ceremony client in packages/user-client/src/ceremonies/revoke.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently, including T009's mid-flight
   case — this is the one guarantee the whole feature exists to prove
5. Demo if ready — this is the entire reason revocation exists (spec.md: "a User who cannot
   reliably and immediately cut off an Agent's access has no real control over a temporal grant")

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → validate via quickstart.md Scenario 1 (MVP!)
3. Add User Story 2 → validate via quickstart.md Scenario 2
4. Add User Story 3 → validate via quickstart.md Scenario 3
5. Each story adds a further correctness guarantee without breaking the previous ones

### Parallel Team Strategy

With multiple developers, after Foundational is done:

- Developer A: User Story 1 (must land first — US2/US3 build on its files)
- Developer B: prep User Story 2's tests (T017–T023) against directly-seeded Grant Records while
  US1 lands, then implement T024/T025 once US1's `revocation-service.ts`/API handlers exist
- Developer C: same pattern for User Story 3 (T026–T032)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All three user stories are P1; US2 and US3 are independently *testable* (via direct Grant
  Record/challenge seeding, per their Independent Test descriptions) but not independently
  *implementable* ahead of US1, since they harden and add coverage to the same
  `revocation-service.ts` and endpoints US1 creates
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- T002/T003 (Phase 2) are the one place this feature's implementation touches 001-grant's
  already-shipped production code — keep that change additive (a new enum member, a new method
  mirroring two existing ones) and do not alter any other `GrantRecord` field or method's
  behavior (plan.md Constitution Check, research.md §4)
- **T034 is not a formality.** If completing US1-US3 required any change to
  `packages/rp-server/src/services/transaction-service.ts`, that means research.md §5's premise
  was wrong and this plan needs revisiting — per the user's own explicit direction before
  `/speckit-plan` was run, this was to be verified, not assumed, and that standard should carry
  through to the end of implementation, not just the start.
