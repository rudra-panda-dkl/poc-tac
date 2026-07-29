# TAC POC — Temporal Agent Credential

A proof-of-concept implementation of the TAC grant/issuance protocol (feature `001-grant` of 3;
see `specs/001-grant/` for the full spec, plan, and design docs, and `.specify/memory/constitution.md`
for the invariants this POC must hold).

## Getting started

```bash
npm install
npx tsc -b packages/shared packages/rp-server packages/user-client packages/agent-client
npx vitest run
```

See `specs/001-grant/quickstart.md` for a walkthrough of the acceptance scenarios (automated and
manual), and `specs/001-grant/tasks.md` for the full task breakdown and status.

## Project layout

An npm-workspaces monorepo with one package per protocol actor, plus a `shared` package holding
the canonicalization logic both the User-signing side and RP-verification side import (so there's
one implementation of RFC 8785/JCS, not two that could drift):

- `packages/shared` — `Credential`/`GrantRecord` types, JCS canonicalization + digest (FR-021).
- `packages/rp-server` — negotiation, nonce issuance/consumption, credential validation, HTTP API.
- `packages/user-client` — the User's two WebAuthn ceremonies; also hosts the Node-compatible
  demo/test signing helper (`software-authenticator.ts`), since `navigator.credentials` doesn't
  exist outside a browser.
- `packages/agent-client` — Agent keypair generation and credential assembly.
- `spikes/001-grant-webauthn-conformance/` — the one-time Playwright + real-Chromium spike that
  validated ceremony two's no-round-trip mechanism (tasks.md T006); not part of the app itself.

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

## Known gaps

See `specs/001-grant/tasks.md`'s Notes and `research.md` §1's residual-scope note for what's
intentionally out of scope for this POC (Firefox/WebKit WebAuthn conformance untested; SC-009 has
no dedicated automated test, only a design-level guarantee via `generate-keypair.ts`'s function
signature).
