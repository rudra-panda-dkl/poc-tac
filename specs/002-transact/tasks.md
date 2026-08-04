---

description: "Task list template for feature implementation"
---

# Tasks: TAC Transaction Flow (Feature 2 of 3)

**Input**: Design documents from `/specs/002-transact/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/transact-api.yaml, quickstart.md (all present)

**Tests**: Included. spec.md structures every user story around an explicit "Independent Test"
and numbered Acceptance Scenarios, and several Success Criteria (SC-001, SC-002, SC-005, SC-006)
are themselves pass/fail assertions over Constitution NON-NEGOTIABLE principles (V: consumption
ordering; VI: dual-layer replay protection) — this feature's correctness is defined in terms of
tests passing, so test tasks are included rather than treated as optional.

**Organization**: Tasks are grouped by user story. All three of this feature's user stories are
P1 (spec.md: US1 is "the entire reason a grant exists"; US2 and US3 validate NON-NEGOTIABLE
constitution principles that must hold as reliably as the happy path) — ordered US1 → US2 → US3
as spec.md presents them. US2 and US3 are independently *testable* (per their own Independent
Test descriptions, by seeding an already-`active` Grant Record directly) but their implementation
tasks hardened the same `TransactionService`/endpoints US1 creates, so in practice they land after
US1, mirroring 001-grant's precedent.

**No conformance-spike gate**: unlike 001-grant, this feature introduces no new WebAuthn ceremony
(FR-006 explicitly forbids one) and no new external dependency, so there is no equivalent to
001-grant's Phase 2 empirical-validation gate. There is, however, a Foundational-phase
cross-feature dependency: this feature requires a small, additive change to 001-grant's
already-implemented `credential-validation-service.ts` (research.md §1) — that change is
sequenced first, in Phase 2, precisely because every later phase depends on it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Per plan.md's Project Structure (extends 001-grant's npm-workspaces monorepo — no new package):

```text
packages/shared/{src,tests/unit}/
packages/rp-server/{src/{models,services,api},tests/{contract,integration,unit}}/
packages/agent-client/{src/transact,tests/{unit,integration}}/
```

No source file inside `packages/user-client/` is modified by this feature (no human present at
transaction time, Constitution Principle VI) — `agent-client`'s manual demo script does take on
a test/demo-only devDependency on it (to reuse the existing software-authenticator signer), the
same pattern `rp-server`'s tests already used in 001-grant.

---

## Phase 1: Setup

**Purpose**: Minimal scaffolding for this feature's new code

**No new dependencies or packages** (research.md §6): this feature reuses `canonicalize` and
WebCrypto, both already dependencies of `packages/shared`/`packages/agent-client` since 001-grant.

- [X] T001 [P] Create `packages/agent-client/src/transact/` directory for this feature's new signing module, per plan.md Project Structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Define `TransactionSignaturePayload` TypeScript type (`{challenge, txType, amount}`) in `packages/shared/src/transaction.ts` per data-model.md "Entity: Transaction Signature Payload"
- [X] T003 Implement `computeTransactionSignatureBytes()` in `packages/shared/src/transaction.ts`: JCS-canonicalize (via the existing `canonicalize` dependency, research.md §2) exactly `{challenge, txType, amount}` and return UTF-8 bytes ready for ECDSA sign/verify (no separate pre-hash step needed — WebCrypto's ECDSA hashes internally); export the new module from `packages/shared/src/index.ts` (depends on T002) — also fixed `base64urlToBuffer()`'s return-type annotation in `canonicalize.ts` (`Uint8Array<ArrayBuffer>` instead of bare `Uint8Array`) to satisfy TS/@types/node's stricter `BufferSource` typing once a returned buffer is fed back into `crypto.subtle.verify()`; not previously exercised since 001-grant never round-tripped a decoded buffer back into WebCrypto
- [X] T004 [P] Implement `TransactionChallengeStore` (in-memory `Map` keyed by `challengeId`) in `packages/rp-server/src/models/transaction-challenge-store.ts`, with an atomic `retrieveForVerification()` method that sets `consumedAt` immediately upon retrieval, before returning the record to any caller (FR-008/FR-009, Constitution Principle V — NON-NEGOTIABLE), storing `{challengeId, challenge, grantNonce, txType, amount, issuedAt, expiresAt, consumedAt}` per data-model.md "Entity: Transaction Challenge" — deliberately a separate `Map` from `GrantRecordStore`, not a namespaced key within it (FR-010, research.md §3)
- [X] T005 [P] Implement `AgentKeyStore` (in-memory `Map` keyed by grant nonce) in `packages/rp-server/src/models/agent-key-store.ts`, storing `{agentPublicKey}` per data-model.md "Entity: Agent Key Record" and research.md §1
- [X] T006 Modify `CredentialValidationService.activate()` in `packages/rp-server/src/services/credential-validation-service.ts` to accept an `AgentKeyStore` constructor dependency and record `credential.identity.agentPublicKey` into it, keyed by `record.nonce`, immediately after `grantStore.transitionToActive(record.nonce)` succeeds — no other behavior of this existing 001-grant service changes (research.md §1, depends on T005) — also added a new non-consuming `GrantRecordStore.get()` production read accessor (`grant-record-store.ts`), since `TransactionService`'s Grant-state gate needs a read-only, repeatable lookup distinct from `retrieveForVerification()`'s consume-once semantics and from the explicitly test-only `peekForTesting()`; and updated `tests/integration/test-helpers.ts`'s `setupTestRp()` to construct and thread through an `AgentKeyStore` too, since it also builds a `CredentialValidationService` (not separately tracked as its own task)
- [X] T007 Wire the new `AgentKeyStore` into `packages/rp-server/src/app.ts`'s `createApp()`: instantiate it, pass it into `CredentialValidationService`'s constructor (per T006), and expose it on the returned object so tests can seed/inspect it directly (depends on T006)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Agent Completes a Permitted Transaction (Priority: P1) 🎯 MVP

**Goal**: Given an `active` Grant Record and Credential from 001-grant, the RP gates a transaction
request against Grant state, issues a fresh challenge, the Agent signs it with its own private
key (no human present), and the RP permits the transaction with an explicit acknowledgment.

**Independent Test**: Seed an `active` Grant Record (as 001-grant would produce, including an
`AgentKeyStore` entry) and its Credential, request a transaction within its scope and window,
complete the challenge-response with the Agent's private key, and confirm the RP returns a permit
decision.

### Tests for User Story 1

- [X] T008 [P] [US1] Contract test for `POST /transact/request` happy path per contracts/transact-api.yaml in `packages/rp-server/tests/contract/transact-request.test.ts`
- [X] T009 [P] [US1] Contract test for `POST /transact/respond` happy path per contracts/transact-api.yaml in `packages/rp-server/tests/contract/transact-respond.test.ts`
- [X] T010 [P] [US1] Integration test for the full transaction flow (spec.md US1 Independent Test): seed an `active` Grant Record + `AgentKeyStore` entry, request an in-scope/in-window transaction, sign the issued challenge with the Agent's real private key (via T012), respond, and confirm `{status: "permitted", grantNonce, challengeId}` (SC-002/SC-006) in `packages/rp-server/tests/integration/full-transaction-flow.test.ts` — backed by a new `packages/rp-server/tests/integration/transaction-test-helpers.ts` (`activateTestGrant()`), not separately tracked as its own task, which drives 001-grant's real negotiate→activate flow using a genuine `@tac/agent-client` keypair so the signature is real, not stubbed
- [X] T011 [P] [US1] Integration test confirming `AgentKeyStore` is populated as a side effect of a real `/grant/activate` success (not a separately-triggered write) — exercises the Foundational T006/T007 wiring end-to-end in `packages/rp-server/tests/integration/agent-key-store-populated-on-activate.test.ts`

### Implementation for User Story 1

- [X] T012 [P] [US1] Implement transaction-response signing in `packages/agent-client/src/transact/sign-transaction-response.ts`: canonicalize `{challenge, txType, amount}` (via T003) and sign with the Agent's existing per-RP private key (`getOrCreateAgentKeypair`, unchanged from 001-grant) using ECDSA P-256/SHA-256 (FR-006 — deliberately not a WebAuthn ceremony; research.md §2) — **this task caught a real, pre-existing 001-grant bug**: `generate-keypair.ts`'s `crypto.subtle.generateKey()` call only requested `["sign"]` usage, which left the *exported public* JWK with `key_ops: []` (no permitted operations) — invisible in 001-grant, since nothing there ever imported the Agent's public key for `verify`, but it broke every signature-verification attempt here. Fixed by requesting `["sign", "verify"]` (WebCrypto splits usages across the generated pair by what's valid for each key type — private key still only gets `sign`, non-extractable, unchanged)
- [X] T012a [P] [US1] Added retroactively (T012's bug was only caught indirectly, via this feature's own signature-verification tests failing — no dedicated unit test on `generate-keypair.ts`'s own contract existed at the time, so this violates the "tests before implementation" ordering this file's own conventions call for; added after the fact to close that gap): regression unit test asserting `getOrCreateAgentKeypair()`'s exported public key JWK is actually importable with `verify` usage and can verify a signature from the matching private key, in `packages/agent-client/tests/unit/generate-keypair.test.ts` — verified effective by temporarily reverting the T012 fix and confirming this test fails
- [X] T013 [US1] Implement `TransactionService` request path in `packages/rp-server/src/services/transaction-service.ts`: look up the Grant Record by `grantNonce` (FR-001), evaluate the Grant-state gate — `status === "active"` (FR-002), current time within `agreedDuration.validFrom`/`validUntil` (FR-003), and `{txType, amount}` in-scope against `agreedScope` interpreted as `{txTypes, maxAmount}` (FR-004, data-model.md scope interpretation) — and on full pass, issue a fresh `TransactionChallenge` bound to this exact `grantNonce`/`txType`/`amount` (FR-005, via T004) (depends on T004, T007)
- [X] T014 [US1] Extend `TransactionService` with the respond path in `packages/rp-server/src/services/transaction-service.ts`: retrieve-and-consume the challenge (via T004's `retrieveForVerification()`, FR-008), verify the signature against `AgentKeyStore`'s recorded key (via T005/T007) over the RP's own stored `{challenge, txType, amount}` — never over values resent in the request body (FR-007, via T003) — and produce the permit decision (FR-011/FR-012) (depends on T013, T005)
- [X] T015 [US1] Implement `POST /transact/request` endpoint in `packages/rp-server/src/api/transact-request.ts`, returning `{challengeId, challenge, expiresAt}` per contracts/transact-api.yaml (depends on T013)
- [X] T016 [US1] Implement `POST /transact/respond` endpoint in `packages/rp-server/src/api/transact-respond.ts`, returning `{status: "permitted", grantNonce, challengeId}` per contracts/transact-api.yaml (depends on T014)
- [X] T017 [US1] Wire both new endpoints into routing in `packages/rp-server/src/app.ts`'s `createApp()` (depends on T015, T016)
- [X] T018 [US1] Wire an end-to-end demo script for quickstart.md Scenario 1 in `packages/agent-client/src/transact/demo-transact.ts` (depends on T016, T012) — **deviated from the plan's `demo-request.ts`/`demo-respond.ts` split**: the Agent's private key is non-extractable and lives only in the process that generated it, so a second `npx tsx` invocation can never recover the same key a prior invocation used to activate a grant, making a two-process split unworkable. Implemented as one self-contained script instead (negotiate → activate → request → respond, all in one process); quickstart.md updated to match. Added `demo:transact` to `agent-client/package.json` and a `@tac/user-client` devDependency + tsconfig project reference (mirrors `rp-server`'s existing cross-package test-only devDependency pattern) so the demo can reuse the existing software-authenticator signer

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently — this is the MVP

---

## Phase 4: User Story 2 - RP Denies a Transaction Outside What Was Granted (Priority: P1)

**Goal**: Any single failed check — Grant not active, out-of-scope, out-of-window, or an
invalid/missing challenge-response — causes the RP to deny the transaction, with no partial
permission granted as a side effect.

**Independent Test**: Seed Grant Records in each denial-worthy state in turn (`pending`,
`expired`, `active`-but-out-of-scope, `active`-but-outside-window) and confirm every transaction
attempt against them is denied, plus confirm an `active`/in-scope/in-window attempt with a
corrupted or missing challenge-response is also denied.

### Tests for User Story 2

- [X] T019 [P] [US2] Integration test: Grant status `pending` → `/transact/request` denies with no challenge issued (SC-001) in `packages/rp-server/tests/integration/deny-grant-pending.test.ts`
- [X] T020 [P] [US2] Integration test: Grant status `expired` → denies with no challenge issued (SC-001) in `packages/rp-server/tests/integration/deny-grant-expired.test.ts`
- [X] T021 [P] [US2] Integration test: `active`/in-window Grant but requested `txType` not in `agreedScope.txTypes` → denies (SC-003) in `packages/rp-server/tests/integration/deny-out-of-scope-txtype.test.ts`
- [X] T022 [P] [US2] Integration test: `active`/in-window Grant but requested `amount` exceeds `agreedScope.maxAmount` → denies (SC-003) in `packages/rp-server/tests/integration/deny-out-of-scope-amount.test.ts`
- [X] T023 [P] [US2] Integration test: `active`/in-scope Grant but current time outside `agreedDuration` window → denies (SC-004) in `packages/rp-server/tests/integration/deny-out-of-window.test.ts` — covers both directions (request after `validUntil`, and before `validFrom`)
- [X] T024 [P] [US2] Integration test: a freshly-issued challenge presented with a missing or invalid signature at `/transact/respond` is denied in `packages/rp-server/tests/integration/deny-invalid-signature.test.ts`
- [X] T025 [US2] Integration test asserting none of the denial categories above create, consume, or activate any state as a side effect (no `TransactionChallenge` left issued-but-unconsumed after a request-time denial; no permit acknowledgment ever sent) in `packages/rp-server/tests/integration/deny-no-side-effects.test.ts` — also added `deny-unknown-grant-reference.test.ts` (not separately tracked as its own task) covering spec.md's Edge Case for an unknown/bogus `grantNonce`, backed by a new `seedGrantRecord()` helper in `transaction-test-helpers.ts` that seeds a Grant Record directly per the Independent Test's own wording, without running a full negotiate/activate ceremony

### Implementation for User Story 2

- [X] T026 [US2] Harden `TransactionService`'s Grant-state gate (T013) to deny distinctly for `pending`/`expired`/out-of-scope/out-of-window while collapsing an unknown/bogus `grantNonce` reference into the same generic denial as "not active" (spec.md Edge Cases) in `packages/rp-server/src/services/transaction-service.ts` — already satisfied by T013/T014's original implementation (all 12 US2 tests, including the unknown-reference edge case, pass against it unmodified); no code change was needed here beyond what US1 already built
- [X] T027 [US2] Add explicit denial-reason → HTTP status mapping (403 for the Grant-state gate and its respond-time re-check; 409 for challenge conflict/expiry; 422 for signature failure) per contracts/transact-api.yaml to `packages/rp-server/src/api/transact-request.ts` and `transact-respond.ts` — likewise already in place from T015/T016's original implementation, verified by the contract/integration tests above

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Transaction Challenge Is Provably Single-Use (Priority: P1)

**Goal**: The transaction-time challenge, once retrieved for verification, cannot be redeemed a
second time — whether the first presentation succeeded or failed a later check — and this replay
protection is distinct from, and independently verifiable of, 001-grant's grant-time nonce layer.

**Independent Test**: Issue a challenge, redeem it once (successfully or with a failing downstream
check), then attempt to redeem the same challenge a second time and confirm it is always rejected
— including when the corresponding Grant Record's own artifacts (from 001-grant) are untouched by
this replay.

### Tests for User Story 3

- [X] T028 [P] [US3] Integration test: replaying an already-successfully-redeemed `challengeId` is rejected (SC-005) in `packages/rp-server/tests/integration/transaction-replay-after-success.test.ts`
- [X] T029 [P] [US3] Integration test: a challenge first presented with an invalid signature, then retried with a corrected, validly-signed response under the same `challengeId`, is still rejected — because `consumedAt` was set at first retrieval, not at first success (FR-008/FR-009, User Story 3 Scenario 2) in `packages/rp-server/tests/integration/transaction-replay-after-failure.test.ts`
- [X] T030 [P] [US3] Integration test: a challenge presented after its own `expiresAt` has elapsed is rejected, mirroring 001-grant's `nonce_expired` handling in `packages/rp-server/tests/integration/transaction-challenge-expiry.test.ts`
- [X] T031 [P] [US3] Integration test: redeeming a transaction challenge does not touch or consume the corresponding Grant Record's own `nonce`/`consumedAt` fields, and vice versa, confirming FR-010's storage independence in `packages/rp-server/tests/integration/transaction-challenge-independent-from-grant-nonce.test.ts`
- [X] T032 [P] [US3] Unit test for `TransactionChallengeStore.retrieveForVerification()`'s atomicity: a second retrieval of the same `challengeId` always returns `undefined`, regardless of the first attempt's downstream outcome, in `packages/rp-server/tests/unit/transaction-challenge-store.test.ts`

### Implementation for User Story 3

- [X] T033 [US3] Implement the challenge-expiry check in `TransactionService`'s respond path (T014): a retrieved-but-expired challenge is treated as consumed but fails the permit decision, distinct from "not found" (data-model.md validation rules) in `packages/rp-server/src/services/transaction-service.ts` — already satisfied by T014's original implementation; verified by T030
- [X] T034 [US3] Audit `TransactionChallengeStore.retrieveForVerification()` (T004) to confirm `consumedAt` is set strictly before the caller evaluates any other check — deliberately re-verify this holds in the new, independent store rather than assuming it does, since 001-grant's equivalent method needed exactly this fix once (see specs/001-grant/quickstart.md's Scenario 3 note) — audited: T004's implementation already sets `consumedAt` synchronously inside `retrieveForVerification()` before returning, mirroring `GrantRecordStore`'s (now-fixed) shape exactly; no bug found this time, confirmed by T028/T029/T032

**Checkpoint**: All three user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T035 [P] Run quickstart.md's three validation scenarios end-to-end against the completed implementation — all three have automated equivalents (59/59 tests passing across the monorepo, including T012a's later addition); also manually ran `demo-transact.ts` (T018) against a live `rp-server` end-to-end and confirmed the `{"status":"permitted",...}` output quickstart.md describes
- [X] T036 [P] Add unit tests for `transaction.ts`'s canonicalization (payload key ordering/number formatting edge cases, mirroring 001-grant's `canonicalize.test.ts`) in `packages/shared/tests/unit/transaction.test.ts`
- [X] T037 [P] Document the transaction-challenge expiry window default/override in `README.md` — also documented the new `packages/shared`/`rp-server`/`agent-client` files this feature added under "Project layout", and updated "Getting started"/"Known gaps" for the second feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories; includes the
  one required change to 001-grant's existing `credential-validation-service.ts` (T006), which
  must land before any transaction request could ever resolve an Agent key
- **User Story 1 (Phase 3)**: Depends on Foundational completion — no dependency on US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational completion; its implementation tasks modify
  code US1 created (T013/`transaction-service.ts`, T015–T016/API handlers), so in practice run
  after US1
- **User Story 3 (Phase 5)**: Depends on Foundational completion; likewise builds on US1's
  `transaction-service.ts` and T004's `transaction-challenge-store.ts`
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no dependency on other stories; this is
  the MVP
- **User Story 2 (P1)**: Independently testable via direct Grant Record seeding (per its
  Independent Test), but its implementation tasks (T026/T027) edit files US1 created — sequence
  after US1 in a single-developer flow
- **User Story 3 (P1)**: Independently testable via direct challenge seeding, same file-sharing
  consideration as US2 — sequence after US1 (and may run in parallel with US2 by a second
  developer, since T033/T034 touch different concerns within largely the same files)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types/models before services
- Services before endpoints
- Core implementation before demo/integration wiring

### Parallel Opportunities

- T001 (Setup) has nothing to block on
- Foundational tasks marked [P] (T002, T004, T005) can run in parallel; T003 depends on T002,
  T006 depends on T005, T007 depends on T006
- All US1 tests (T008–T011) can run in parallel; T012 (agent-client) can run in parallel with the
  rp-server implementation tasks (T013–T014) until T018 needs both
- All US2 tests (T019–T024) can run in parallel
- All US3 tests (T028–T032) can run in parallel
- All Polish tasks (T035–T037) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Contract test for POST /transact/request in packages/rp-server/tests/contract/transact-request.test.ts"
Task: "Contract test for POST /transact/respond in packages/rp-server/tests/contract/transact-respond.test.ts"
Task: "Integration test for the full transaction flow in packages/rp-server/tests/integration/full-transaction-flow.test.ts"
Task: "Integration test confirming AgentKeyStore is populated on /grant/activate in packages/rp-server/tests/integration/agent-key-store-populated-on-activate.test.ts"

# Launch independent implementation tasks together:
Task: "Implement transaction-response signing in packages/agent-client/src/transact/sign-transaction-response.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories; includes the 001-grant
   `credential-validation-service.ts` change)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run quickstart.md Scenario 1 independently
5. Demo if ready — this is the entire reason a grant exists (spec.md: "an Agent that can never
   actually transact delivers no value")

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → validate via quickstart.md Scenario 1 (MVP!)
3. Add User Story 2 → validate via quickstart.md Scenario 2
4. Add User Story 3 → validate via quickstart.md Scenario 3
5. Each story adds a further correctness guarantee without breaking the previous ones

### Parallel Team Strategy

With multiple developers, after Foundational is done:

- Developer A: User Story 1 (must land first — US2/US3 build on its files)
- Developer B: prep User Story 2's tests (T019–T025) against a directly-seeded Grant Record while
  US1 lands, then implement T026/T027 once US1's `transaction-service.ts`/API handlers exist
- Developer C: same pattern for User Story 3 (T028–T034)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All three user stories are P1; US2 and US3 are independently *testable* (via direct Grant
  Record/challenge seeding, per their Independent Test descriptions) but not independently
  *implementable* ahead of US1, since they harden and add coverage to the same
  `transaction-service.ts` and endpoints US1 creates
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- T006/T007 (Phase 2) are the one place this feature's implementation touches 001-grant's
  already-shipped production code — keep that change additive (new constructor param, new store,
  one new call site) and do not alter `GrantRecord` or `Credential`'s existing field-level
  contract (plan.md Constitution Check, research.md §1). T006 separately also updates
  `tests/integration/test-helpers.ts` (shipped test infrastructure, not production code).
