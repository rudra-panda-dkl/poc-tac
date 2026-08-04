# TAC POC — Temporal Agent Credential

A proof-of-concept implementation of the full TAC protocol: grant/issuance (`001-grant`), the
transaction-time challenge-response flow (`002-transact`), and lightweight RP-local revocation
(`003-revoke`) — all 3 planned features; see `specs/001-grant/`, `specs/002-transact/`, and
`specs/003-revoke/` for the full specs, plans, and design docs, and
`.specify/memory/constitution.md` for the invariants this POC must hold.

## Getting started

```bash
npm install
npx tsc -b packages/shared packages/rp-server packages/user-client packages/agent-client
npx vitest run
```

See each feature's `quickstart.md` (`specs/001-grant/`, `specs/002-transact/`,
`specs/003-revoke/`) for a walkthrough of the acceptance scenarios (automated and manual), and
each feature's `tasks.md` for the full task breakdown and status.

## Project layout

An npm-workspaces monorepo with one package per protocol actor, plus a `shared` package holding
the canonicalization logic both the User-signing side and RP-verification side import (so there's
one implementation of RFC 8785/JCS, not two that could drift):

- `packages/shared` — `Credential`/`GrantRecord` types, JCS canonicalization + digest (FR-021);
  002-transact adds `transaction.ts` (`TransactionSignaturePayload` + its own JCS-canonicalized
  signature-bytes helper, same one-implementation-shared-by-both-sides rationale). 003-revoke
  extends `GrantRecordStatus` with `"revoked"` (`grant-record.ts`) — the one field it adds, per
  001-grant's own docblock, which reserved this extension point from the start.
- `packages/rp-server` — negotiation, nonce issuance/consumption, credential validation, HTTP API;
  002-transact adds the Grant-state gate + challenge issuance/verification (`transaction-service.ts`),
  its own independent single-use challenge store (`transaction-challenge-store.ts`, deliberately
  separate storage from the grant-nonce layer per FR-010), and `agent-key-store.ts` (captures the
  Agent's public key at grant-activation time, since the `Credential` presented there is never
  otherwise persisted — see `specs/002-transact/research.md` §1). 003-revoke adds
  `revocation-service.ts` (a single WebAuthn ceremony reusing ceremony one's mechanism, FR-004)
  and its own independent `revocation-challenge-store.ts` (the third of three sibling single-use
  artifact stores Constitution Principle V names) — and adds `transitionToRevoked()` to
  `grant-record-store.ts`, but makes **zero changes** to `transaction-service.ts`: revocation's
  synchronous effect rides entirely on that file's existing `status === "active"` check, verified
  by direct source inspection before 003-revoke was planned (see `specs/003-revoke/research.md` §5).
- `packages/user-client` — the User's two WebAuthn ceremonies; also hosts the Node-compatible
  demo/test signing helper (`software-authenticator.ts`), since `navigator.credentials` doesn't
  exist outside a browser. Untouched by 002-transact (no human present at transaction time);
  003-revoke adds `ceremonies/revoke.ts` here instead, since revocation authenticates the User,
  never the Agent — the inverse of 002-transact's package split.
- `packages/agent-client` — Agent keypair generation and credential assembly; 002-transact adds
  `transact/sign-transaction-response.ts` (raw ECDSA sign over the RP-issued challenge plus the
  transaction's own parameters — deliberately not a WebAuthn ceremony, FR-006). Untouched by
  003-revoke (no Agent role in revocation, spec.md Edge Cases there).
- `spikes/001-grant-webauthn-conformance/` — the one-time Playwright + real-Chromium spike that
  validated ceremony two's no-round-trip mechanism (001-grant tasks.md T006); not part of the app
  itself. Neither 002-transact nor 003-revoke introduces a new WebAuthn ceremony *shape* — both
  reuse existing, already-validated mechanisms — so neither has an equivalent spike.

## Environment / configuration

| Variable | Default | Meaning |
|---|---|---|
| `TAC_RP_ID` | `localhost` | The RP's WebAuthn `rpID` (see `packages/rp-server/src/services/webauthn.ts`). |
| `TAC_RP_ORIGIN` | `http://localhost` | Expected WebAuthn assertion origin — must match whatever origin the User's client actually presents (a real browser-served UI would set this to that page's origin). |
| `PORT` | `4000` | Port `rp-server`'s HTTP API listens on (`packages/rp-server/src/index.ts`). |
| `TAC_RP_SERVER` | `http://localhost:4000` | Base URL the `user-client` demo scripts call. |

**Assurance Ceiling Policy** (FR-007a): concrete per-assurance-level duration ceilings are
implementation-defined, not spec-mandated. This POC's default (`AssuranceCeilingPolicy.defaultPolicy()`
in `packages/rp-server/src/models/assurance-ceiling-policy.ts`) is 15 minutes for `UP`, 24 hours
for `UP+UV` — adjust there if you need different POC defaults; there's no environment-variable
override for these yet.

**Grant nonce window** (FR-012): defaults to 5 minutes, enforced in
`packages/rp-server/src/services/negotiation-service.ts`'s `NegotiationService` constructor
(`nonceWindowSeconds` parameter) — no environment variable yet; construct the service with a
different value if needed.

**Transaction challenge window** (002-transact spec.md Assumptions — short-lived by design, not a
negotiated term): defaults to 60 seconds, enforced in
`packages/rp-server/src/services/transaction-service.ts`'s `TransactionService` constructor
(`challengeWindowSeconds` parameter, mirroring the grant nonce window's own constructor-parameter
pattern) — no environment variable yet; construct the service with a different value if needed.
Deliberately a separate, shorter-lived window from the Grant Record's own
`validFrom`/`validUntil`, and from the grant nonce's own 5-minute window (FR-010).

**Revocation challenge window** (003-revoke, same short-lived-by-design rationale as the
transaction challenge window): defaults to 60 seconds, enforced in
`packages/rp-server/src/services/revocation-service.ts`'s `RevocationService` constructor
(`challengeWindowSeconds` parameter) — no environment variable yet. A third, independent window
from the grant nonce's and the transaction challenge's own (Constitution Principle V — three
sibling single-use artifacts, three separate stores, three separate lifetimes).

## Known gaps

See each feature's `tasks.md` Notes for what's intentionally out of scope for this POC.
001-grant: Firefox/WebKit WebAuthn conformance untested; SC-009 has no dedicated automated test,
only a design-level guarantee via `generate-keypair.ts`'s function signature. 002-transact: no
additional known gaps beyond what spec.md's own Feature Boundary already excludes (no downstream
business-transaction execution, no revocation, no human-in-the-loop exception handling — all
explicitly deferred to 003-revoke or out of this POC's scope). Like 001-grant's SC-009, FR-005's
"MUST NOT accept an Agent-proactively-generated proof" and FR-006's "MUST NOT carry
human-presence semantics" have no dedicated negative-case test — they're satisfied structurally
(`/transact/respond`'s request body has no field for a client-supplied challenge value, and the
transaction-time signing path has no `@simplewebauthn` dependency at all), not by an explicit
assertion. 003-revoke: no additional known gaps beyond spec.md's own Feature Boundary (no
rollback of already-permitted transactions, no in-place scope amendment, no bulk revocation — all
explicitly out of scope, Constitution Non-Goals). This closes all three planned TAC POC features.
