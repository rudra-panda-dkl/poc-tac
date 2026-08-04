# Phase 1 Data Model: TAC Transaction Flow (002-transact)

Source: spec.md Key Entities section, cross-referenced with FR-001–FR-012, and research.md's
resolution of where the Agent's public key is available at transaction time (§1). New types below
live in `packages/shared/src/transaction.ts` unless noted, so `rp-server` and `agent-client`
import the same shapes rather than maintaining parallel copies — the same pattern 001-grant's
`data-model.md` established for `credential.ts`.

## Entity: Transaction Challenge

RP-issued, single-use, `rp-server`-owned (`TransactionChallengeStore`, research.md §3). Distinct
storage and consumption logic from 001-grant's `GrantRecord.nonce` (FR-010) — a separate `Map`,
not a namespaced key inside `GrantRecordStore`.

| Field | Type | Notes |
|-------|------|-------|
| `challengeId` | string | Map key; generated when `/transact/request` passes the Grant-state gate (FR-005). |
| `challenge` | string (opaque random token) | The value the Agent signs over; distinct from `challengeId` so the ID itself never needs to be secret or unguessable — only `challenge` does. |
| `grantNonce` | string | The Grant Record this challenge was issued against (Key Entities: "bound to the Grant Record it was issued against"). |
| `txType` | string | The transaction type this challenge was issued for; bound at issuance, not re-accepted from the Agent's response (FR-007 — the RP recomputes the signed payload from what it itself bound, not from anything the Agent resends). |
| `amount` | number | The transaction amount this challenge was issued for; same binding rationale as `txType`. |
| `issuedAt` | ISO 8601 timestamp | Set at record creation. |
| `expiresAt` | ISO 8601 timestamp | Short-lived by design (spec.md Assumptions); POC-reasonable default is implementation configuration, mirroring 001-grant's nonce-window treatment (research.md §5). |
| `consumedAt` | ISO 8601 timestamp \| `null` | Set the instant the challenge is retrieved for verification (FR-008), before any other check — same semantics as `GrantRecord.consumedAt` in 001-grant, but on entirely separate storage (FR-010). |

**Validation rules**:
- `retrieveForVerification(challengeId)` MUST return `undefined` if `consumedAt !== null`,
  regardless of whether the retrieval that set it succeeded or failed downstream (FR-009) — same
  contract as `GrantRecordStore.retrieveForVerification()`.
- A retrieved-but-expired challenge (`expiresAt` in the past) MUST still be treated as consumed
  (it was retrieved) but MUST fail the permit decision, mirroring 001-grant's
  `nonce_expired` handling in `CredentialValidationService.activate()`.
- The signed payload the RP verifies against is always reconstructed from the challenge record's
  own stored `{ challenge, txType, amount }`, never from values resent in the Agent's response
  body — this is what makes FR-007's tamper-evidence claim hold against a wire-level tamper
  attempt, not just against a mismatched signature.

## Entity: Agent Key Record

New, `rp-server`-owned (`AgentKeyStore`, research.md §1). Not part of `GrantRecord`'s or
`Credential`'s field-level contract — a side-table populated once, at the moment 001-grant's
`/grant/activate` succeeds, closing the gap where `Credential.identity.agentPublicKey` would
otherwise be unreachable after activation.

| Field | Type | Notes |
|-------|------|-------|
| `grantNonce` | string | Map key — same nonce used as `GrantRecordStore`'s key, so a transaction request's Grant reference (FR-001) resolves both records via one identifier. |
| `agentPublicKey` | JWK (ECDSA P-256 / ES256), JSON | Copied verbatim from `Credential.identity.agentPublicKey` at activation; never regenerated or re-derived by this feature. |

**Validation rule**: `/transact/request` and `/transact/respond` MUST look up `agentPublicKey` by
the same `grantNonce` the request references; a lookup miss (a Grant reference with no recorded
Agent key — should not occur for any Grant Record reached via a normal 001-grant activation, but
is possible for a malformed/bogus reference) is treated identically to "Grant not active" (FR-002,
Edge Cases: unknown/bogus grant reference denies without distinction).

## Entity: Transaction Signature Payload

Not persisted — a `packages/shared/src/transaction.ts` type describing exactly what the Agent
signs and what the RP reconstructs to verify (FR-007). Canonicalized via the same `canonicalize`
(JCS) dependency 001-grant's `canonicalize.ts` already established, then signed/verified directly
(no separate pre-hash step — WebCrypto's ECDSA sign/verify hashes internally when given a `hash`
parameter; research.md §2).

| Field | Type | Notes |
|-------|------|-------|
| `challenge` | string | The `TransactionChallenge.challenge` value. |
| `txType` | string | Must match the challenge's bound `txType`. |
| `amount` | number | Must match the challenge's bound `amount`. |

**Signing (Agent side, `agent-client`)**: `signature = ECDSA-P256-SHA256-sign(privateKey,
UTF8(JCS({challenge, txType, amount})))` using the private key from the Agent's existing per-RP
keypair (`getOrCreateAgentKeypair`, unchanged from 001-grant).

**Verification (RP side, `rp-server`)**: the RP reconstructs `{challenge, txType, amount}` from
its own stored `TransactionChallenge` record (never from the request body) and verifies the
Agent's signature against `AgentKeyStore`'s recorded `agentPublicKey` for that `grantNonce`.

## Entity: Grant Record *(from 001-grant, read only, not redefined)*

This feature reads `status`, `agreedScope`, and `agreedDuration.validFrom`/`validUntil` to
evaluate the Grant-state gate (FR-002/FR-003/FR-004). It does not add fields to this entity (see
research.md §1 for why the Agent public key instead lives in a new, separate `AgentKeyStore`
rather than as a new `GrantRecord` field).

**Scope interpretation (FR-004)**: `agreedScope` is opaque at the type level
(`CredentialScope = Record<string, unknown>`, from `credential.ts`), but this feature interprets
it structurally as `{ txTypes: string[], maxAmount: number }` — matching the shape 001-grant's own
demo scripts and tests already established as example content (e.g.
`packages/user-client/src/demo/negotiate.ts`, `packages/rp-server/tests/integration/full-grant-flow.test.ts`).
A requested transaction is in-scope iff `txTypes.includes(requestedTxType) && requestedAmount <=
maxAmount` — both required (FR-004).

## Entity: Credential *(from 001-grant, referenced only, not persisted by this feature)*

Not read directly by 002-transact at transaction time — it was already consumed once by
001-grant's `/grant/activate`. What this feature actually needs from it
(`identity.agentPublicKey`) is captured into `Agent Key Record` above at that same moment, so
002-transact never needs to see a `Credential` object itself.

## Transaction Challenge state flow

```
        Agent requests transaction (grantNonce, txType, amount)
                            │
                            ▼
        Grant-state gate: active? in-window? in-scope?  (FR-002/003/004)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
          any check fails            all checks pass
              │                           │
              ▼                           ▼
       deny, no challenge          issue TransactionChallenge
       issued (SC-001)             { challengeId, challenge,
                                      grantNonce, txType, amount,
                                      issuedAt, expiresAt,
                                      consumedAt: null }      (FR-005)
                                            │
                                            ▼
                              Agent signs {challenge, txType,
                              amount} with its per-RP private
                              key (FR-006) — no WebAuthn ceremony
                                            │
                                            ▼
                          RP: retrieveForVerification(challengeId)
                          — consumedAt set NOW, before any other
                          check (FR-008, Principle V NON-NEGOTIABLE)
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                    already consumed /              first-time
                    not found → deny (FR-009)        retrieval
                                                            │
                                                            ▼
                                          re-check Grant active + in-window
                                          (research.md §5) + challenge not
                                          expired + signature verifies
                                          against AgentKeyStore's key
                                          (FR-007/FR-011)
                                                            │
                                  ┌─────────────────────────┴─────────────────────────┐
                                  ▼                                                     ▼
                            any check fails                                    all checks pass
                                  ▼                                                     ▼
                            deny (no permit)                              permit; explicit permitted
                                                                            acknowledgment sent (FR-012)
```

Note: a second presentation of the same `challengeId` — whether the first attempt succeeded or
failed downstream — always hits the "already consumed" branch (FR-009, User Story 3 Scenario 2),
exactly mirroring `GrantRecordStore`'s proven-correct behavior from 001-grant.
