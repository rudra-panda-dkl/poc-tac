# Quickstart: Validating the TAC Grant Revocation Flow (003-revoke)

This guide runs the acceptance scenarios from spec.md's User Stories 1–3 against the
implementation once built. It is a validation guide, not an implementation reference — see
tasks.md for build steps.

**Two ways to run these scenarios** (mirrors 001-grant's and 002-transact's quickstart.md):

1. **Automated test suite** (`npx vitest run`) — the authoritative, repeatable version of all
   three scenarios below, plus HTTP-level contract tests.
2. **Manual demo CLI** (`npm run demo:revoke --workspace=@tac/user-client`, added by this
   feature) — a hands-on walkthrough of Scenario 1 against a real running `rp-server` process.

## Prerequisites

- Node.js 20 LTS, npm (unchanged).
- A seeded passkey (`npm run seed:passkey --workspace=@tac/rp-server`) and a running `rp-server`.
- An `active` Grant Record to revoke. The automated suite seeds this directly per test (via a
  `revocation-test-helpers.ts` analogous to 002-transact's own `transaction-test-helpers.ts`).
  The manual demo drives a real grant negotiation first (reusing the same software-authenticator
  signer 001-grant's and 002-transact's demos already use), then revokes it, then confirms a
  transaction attempt against it is denied — chaining all three features' HTTP surfaces in one
  script, the same self-contained-script lesson 002-transact's own `demo-transact.ts` already
  established (a User-driven demo can reuse an already-running seeded server across calls within
  one process; what can't cross process boundaries is a non-extractable private key, and this
  demo never needs one — the User's software-authenticator key is re-importable from
  `.tac-demo-state.json`'s JWK the same way `sign.ts` already does it).

## Setup

```bash
npm install
npx tsc -b packages/shared packages/rp-server packages/user-client
```

### Running the automated test suite (recommended)

```bash
npx vitest run
```

Runs all Scenario 1–3 equivalents (mapping below) plus HTTP contract tests for
`/revoke/request` and `/revoke/respond`, using a fresh in-process `rp-server` instance per test
file.

### Running the manual demo CLI (Scenario 1 only, interactive)

```bash
npx tsx packages/rp-server/src/services/seed.ts     # seeds one passkey, writes .tac-demo-state.json
npx tsx packages/rp-server/src/index.ts &            # starts rp-server on :4000, reads that seed
npx tsx packages/user-client/src/demo/revoke.ts
```

`demo/revoke.ts` negotiates and activates a fresh grant (reusing the same steps
`demo/negotiate.ts` + `demo/sign.ts` perform), revokes it, then immediately attempts a
transaction against it via 002-transact's `/transact/request` and confirms the RP denies it.
Expect the final output to show a `revoked` acknowledgment followed by a `grant_not_active`
denial.

## Scenario 1 — User Story 1: User revokes an active Grant; future transactions are immediately denied

**Automated**: an `rp-server` integration test seeding an `active` Grant, revoking it via
`RevocationService` directly, then immediately calling `TransactionService.request()` against the
same `grantNonce` and confirming denial (SC-001/SC-002) — plus
`packages/rp-server/tests/contract/revoke-request.test.ts` +
`revoke-respond.test.ts` (same flow over real HTTP).

**Manual**: the demo sequence above.

## Scenario 2 — User Story 2: RP denies revocation attempts that aren't properly authenticated or scoped

**Automated**: integration tests seeding each denial-worthy Grant state in turn — `pending`,
`expired`, already-`revoked` — confirming `/revoke/request` denies with no challenge issued
(SC-003); a test issuing a revocation challenge for Grant A and presenting a validly-signed
response against Grant B's context, confirming denial and that neither record's status changes
(SC-004); a test presenting a corrupted/missing signature to `/revoke/respond` against an
otherwise-valid challenge, confirming denial.

## Scenario 3 — User Story 3: revocation challenge is provably single-use

**Automated**: integration tests covering — a challenge redeemed once successfully, then
presented again (denied); a challenge presented first with an invalid signature, then retried
with a corrected, validly-signed response using the *same* `challengeId` (still denied, because
`consumedAt` was set at first retrieval, not at first success — FR-007/FR-008). Confirms SC-005,
and confirms (via `GrantRecordStore`/`TransactionChallengeStore` accessors) that none of this
touches either of the other two single-use-artifact layers, satisfying FR-009's independence
requirement.

## Cross-feature note: no changes to `TransactionService`

`packages/rp-server/tests/integration/` for this feature should include one test asserting that
`packages/rp-server/src/services/transaction-service.ts` is **not modified** by this feature's
implementation (e.g., a diff/hash check against its pre-003-revoke state, or simply: the test
suite that already exists for it in `002-transact`'s own test files continues to pass unmodified)
— research.md §5's claim that the existing Grant-state gate is sufficient is the load-bearing
design decision this whole feature rests on; if a task ever finds itself editing that file, that
is a signal the plan's premise needs revisiting, not a routine change.

## Cleanup

```bash
# Manual demo: stop the background rp-server process (Ctrl-C, or kill the tsx process) —
# in-memory stores (GrantRecordStore, RevocationChallengeStore, TransactionChallengeStore)
# discard all state on exit.
rm -f .tac-demo-state.json
```
