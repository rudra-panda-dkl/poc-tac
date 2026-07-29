# Quickstart: Validating the TAC Grant Flow (001-grant)

This guide runs the acceptance scenarios from spec.md's User Stories 1–3 against the actual
implementation. It is a validation guide, not an implementation reference — see tasks.md for
build steps.

**Two ways to run these scenarios**, both implemented and passing:

1. **Automated test suite** (`npx vitest run`) — the authoritative, repeatable version of all
   three scenarios below, plus HTTP-level contract tests. This is what CI would run.
2. **Manual demo CLI** (`npm run demo:*`) — a hands-on walkthrough of Scenario 1 against a real
   running `rp-server` process, useful for interactively inspecting the protocol.

## A note on "real browser" vs. this quickstart

tasks.md T006 required empirically validating ceremony two's no-round-trip WebAuthn mechanism
against a **real browser engine** (Chromium, via Playwright + a CDP virtual authenticator) — see
`spikes/001-grant-webauthn-conformance/` and research.md §1's recorded outcome. That validation
is done and belongs to a one-time spike, not this quickstart.

The scenarios below, and the demo CLI, use a different, narrower tool: a Node-side "software
authenticator" (`packages/user-client/src/demo/software-authenticator.ts`) that signs real,
`@simplewebauthn/server`-verifiable WebAuthn assertions using the same keypair `rp-server`
registered — without needing a live browser for every test run. This validates the *rest* of the
protocol (negotiation, credential assembly, JCS digest correctness, RP-side checks); it does not
re-litigate the browser-API question T006 already answered.

## Prerequisites

- Node.js 20 LTS (developed against v19.7 locally without issue, but the plan targets 20 LTS).
- npm.

## Setup

```bash
npm install
npx tsc -b packages/shared packages/rp-server packages/user-client packages/agent-client
```

### Running the automated test suite (recommended)

```bash
npx vitest run
```

This runs all Scenario 1–3 equivalents (see mapping below) plus HTTP contract tests, using a
fresh in-process `rp-server` instance per test file — no manual seeding or server startup needed.

### Running the manual demo CLI (Scenario 1 only, interactive)

```bash
npx tsx packages/rp-server/src/services/seed.ts     # seeds one passkey, writes .tac-demo-state.json
npx tsx packages/rp-server/src/index.ts &            # starts rp-server on :4000, reads that seed
npx tsx packages/agent-client/src/demo/keypair.ts localhost
npx tsx packages/user-client/src/demo/negotiate.ts
npx tsx packages/user-client/src/demo/sign.ts
```

`.tac-demo-state.json` (gitignored) hands negotiated terms and the Agent's public key between
these separate CLI processes — see `packages/shared/src/demo-state.ts`. It is not a security
boundary; a real deployment has these as genuinely separate long-running processes.

## Scenario 1 — User Story 1: full grant, happy path

**Automated**: `packages/rp-server/tests/integration/full-grant-flow.test.ts` and
`packages/rp-server/tests/contract/activate.test.ts` (the latter runs the same flow over real
HTTP against an ephemeral-port server).

**Manual**: the `demo:*` sequence above. Expect `sign.ts`'s final output to be
`{"status":"active","grantNonce":"..."}`. Confirms SC-005.

Along the way: `demo:keypair.ts`'s only input is `rpIdentifier` (FR-018a/OQ-3 — the Agent never
receives scope/duration before delivery); `sign.ts` computes the JCS digest and completes
ceremony two with no additional network call to `rp-server` between ceremony one and this step
(FR-004).

## Scenario 2 — User Story 2: clean abort on validation failure

**Automated**: `packages/rp-server/tests/integration/abort-account-mismatch.test.ts`,
`abort-invalid-signature.test.ts`, `abort-nonce-mismatch.test.ts`, `abort-terms-mismatch.test.ts`,
and `abort-no-side-effects.test.ts` — each seeds a `pending` Grant Record, presents one category
of invalid credential, and confirms a 4xx-equivalent rejection with the record still `pending`
and no additional record created (SC-003).

## Scenario 3 — User Story 3: nonce single-use and expiry

**Automated**: `packages/rp-server/tests/integration/replay-after-success.test.ts`,
`replay-after-failure.test.ts`, and `nonce-expiry.test.ts` — cover all three conditions (replay
after success, replay after a failed downstream check, and expiry) confirming SC-002/SC-007/
SC-010.

Note: these tests caught a real bug during implementation — the original
`GrantRecordStore.retrieveForVerification()` didn't actually reject an already-consumed nonce on
a second retrieval (see research.md/tasks.md T040 for the fix and how it was found).

## Cleanup

```bash
# Manual demo: stop the background rp-server process (Ctrl-C, or kill the tsx process) —
# in-memory store discards all state on exit.
rm -f .tac-demo-state.json
```
