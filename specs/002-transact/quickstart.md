# Quickstart: Validating the TAC Transaction Flow (002-transact)

This guide runs the acceptance scenarios from spec.md's User Stories 1–3 against the
implementation once built. It is a validation guide, not an implementation reference — see
tasks.md for build steps.

**Two ways to run these scenarios** (mirrors 001-grant's quickstart.md):

1. **Automated test suite** (`npx vitest run`) — the authoritative, repeatable version of all
   three scenarios below, plus HTTP-level contract tests. This is what CI would run.
2. **Manual demo CLI** (`npm run demo:transact --workspace=@tac/agent-client`, added by this
   feature) — a hands-on walkthrough of Scenario 1 against a real running `rp-server` process.

## Prerequisites

- Node.js 20 LTS, npm (unchanged from 001-grant).
- A seeded passkey (`npm run seed:passkey --workspace=@tac/rp-server`) and a running `rp-server`.
  Unlike the automated suite, the manual demo does NOT chain onto 001-grant's separately-run
  `demo:negotiate`/`demo:keypair`/`demo:sign` CLI steps: the Agent's private key is
  non-extractable and lives only in the process that generated it (FR-017), so a later `npx tsx`
  invocation can never recover the same key a prior invocation used to activate a grant. The
  `demo:transact` script instead runs the full grant negotiation, activation, AND the
  transaction request/respond round-trip in one process — the request/respond split is an
  HTTP-protocol round-trip within a single Agent actor, not an actor-boundary split like grant's
  three separate ceremonies, so there is no reason to spread it across separate CLI processes.

## Setup

```bash
npm install
npx tsc -b packages/shared packages/rp-server packages/agent-client
```

### Running the automated test suite (recommended)

```bash
npx vitest run
```

Runs all Scenario 1–3 equivalents (mapping below) plus HTTP contract tests for
`/transact/request` and `/transact/respond`, using a fresh in-process `rp-server` instance per
test file, seeded directly to an `active` Grant Record (no need to replay all of 001-grant's
WebAuthn ceremonies per test).

### Running the manual demo CLI (Scenario 1 only, interactive)

```bash
npx tsx packages/rp-server/src/services/seed.ts     # seeds one passkey, writes .tac-demo-state.json
npx tsx packages/rp-server/src/index.ts &            # starts rp-server on :4000, reads that seed
npx tsx packages/agent-client/src/transact/demo-transact.ts
```

`demo-transact.ts` negotiates and activates a fresh grant, then immediately requests and
completes a transaction against it, printing each step's result. Expect the final output to be
`{"status":"permitted","grantNonce":"...","challengeId":"..."}`.

## Scenario 1 — User Story 1: Agent completes a permitted transaction

**Automated**: `packages/rp-server/tests/integration/` happy-path test (seeded `active` Grant,
in-scope/in-window request, correctly-signed response) and
`packages/rp-server/tests/contract/transact-request.test.ts` +
`transact-respond.test.ts` (same flow over real HTTP against an ephemeral-port server).

**Manual**: the demo sequence above. Confirms SC-002 and SC-006 (the permit acknowledgment
traces to one specific Grant Record and one specific consumed challenge).

## Scenario 2 — User Story 2: RP denies a transaction outside what was granted

**Automated**: integration tests seeding each denial-worthy Grant state in turn — `pending`,
`expired`, `active`-but-out-of-scope (wrong `txType` and separately over-`maxAmount`),
`active`-but-outside-window — confirming `/transact/request` denies with no challenge issued
(SC-001), plus a separate test presenting a corrupted/missing signature to `/transact/respond`
against an otherwise-valid challenge, confirming denial (SC-003/SC-004).

## Scenario 3 — User Story 3: transaction challenge is provably single-use

**Automated**: integration tests covering — a challenge redeemed once successfully, then
presented again (denied); a challenge presented first with an invalid signature, then retried
with a corrected, validly-signed response using the *same* `challengeId` (still denied, because
`consumedAt` was set at first retrieval, not at first success — FR-008/FR-009). Confirms SC-005,
and confirms (via `AgentKeyStore`/`GrantRecordStore` accessors) that none of this touches
001-grant's own nonce layer, satisfying FR-010's independence requirement.

## Cross-feature note: `AgentKeyStore`

`packages/rp-server/tests/integration/` for this feature should include one test asserting that
`AgentKeyStore` is populated as a side effect of 001-grant's `/grant/activate` succeeding (not a
002-transact-owned write path) — this is the one place this feature's implementation touches
001-grant's existing `credential-validation-service.ts` (research.md §1, plan.md Constitution
Check). If this test fails, transaction requests will not be able to look up an Agent public key
for any newly-activated Grant.

## Cleanup

```bash
# Manual demo: stop the background rp-server process (Ctrl-C, or kill the tsx process) —
# in-memory stores (GrantRecordStore, AgentKeyStore, TransactionChallengeStore) discard all
# state on exit.
rm -f .tac-demo-state.json
```
