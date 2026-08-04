# Phase 1 Data Model: TAC Grant Revocation Flow (003-revoke)

Source: spec.md Key Entities section, cross-referenced with FR-001–FR-015, and research.md's
resolution of how the revocation challenge binds to a Grant Record without a new artifact type
proliferating unnecessarily. New types below live in
`packages/rp-server/src/models/revocation-challenge-store.ts` unless noted.

## Entity: Revocation Challenge

RP-issued, single-use, `rp-server`-owned (`RevocationChallengeStore`, research.md §3). Distinct
storage and consumption logic from both 001-grant's `GrantRecord.nonce` and 002-transact's
`TransactionChallenge` (FR-009) — a separate `Map`, not a namespaced key inside either existing
store.

| Field | Type | Notes |
|-------|------|-------|
| `challengeId` | string | Map key; generated when `/revoke/request` passes the Grant-state gate (FR-002/FR-003). |
| `challenge` | string | The WebAuthn assertion ceremony's own `challenge` value (research.md §1) — not a separate artifact from the ceremony's challenge, unlike 001-grant's ceremony-one/nonce split, since revocation is a single ceremony with nothing to bridge between two round-trips. |
| `grantNonce` | string | The Grant Record this challenge targets (Key Entities: "bound to the specific Grant Record it targets"). This is the ONLY place the target is recorded — never re-accepted from the caller at respond time (FR-006). |
| `issuedAt` | ISO 8601 timestamp | Set at record creation. |
| `expiresAt` | ISO 8601 timestamp | Short-lived by design, mirroring 002-transact's Transaction Challenge window treatment (spec.md Assumptions there; same POC-reasonable-default-as-implementation-policy pattern applies here). |
| `consumedAt` | ISO 8601 timestamp \| `null` | Set the instant the challenge is retrieved for verification (FR-007), before any other check — same semantics as `GrantRecord.consumedAt` and `TransactionChallenge.consumedAt`, on entirely separate storage (FR-009). |

**Validation rules**:
- `retrieveForVerification(challengeId)` MUST return `undefined` if `consumedAt !== null`,
  regardless of whether the retrieval that set it succeeded or failed downstream (FR-008) — same
  contract as the other two stores' equivalent methods.
- A retrieved-but-expired challenge MUST still be treated as consumed (it was retrieved) but MUST
  fail the revocation, mirroring both prior features' `*_expired` handling.
- The Grant Record that is actually transitioned to `revoked` is always the one recorded on the
  challenge record itself (`grantNonce`), never a value resent in the respond request body — this
  is what makes FR-006's cross-credential-replay claim hold structurally, not just by convention.

## Entity: Grant Record *(from 001-grant, extended here)*

This is the one entity this feature adds a value to, not merely reads.

| Field | Change |
|-------|--------|
| `status` | `GrantRecordStatus` gains `"revoked"` (now `"pending" \| "active" \| "expired" \| "revoked"`), reachable only from `"active"` (FR-010) — 001-grant's own `grant-record.ts` docblock already reserved this exact extension. |
| `userPublicKeyRef` | Unchanged shape; read (not modified) by this feature to resolve which registered passkey may authorize revoking this Grant (FR-005). |
| everything else | Unchanged — this feature adds no other field. |

**State machine addition** (extends 001-grant's `data-model.md` diagram — only the new edge is
shown; `pending`→`active`/`expired` transitions are unchanged and owned by 001-grant):

```
                    [active]  (existing, from 001-grant)
                        │
     revocation challenge retrieved for verification
     (consumedAt set immediately — FR-007)
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
  all checks pass                 any check fails
  (signature valid,                     │
   target-match implicit)               ▼
        │                        [active]  (unchanged — a failed
        ▼                         revocation attempt never mutates
    [revoked]                     status; only a successful one does,
    (terminal —                   FR-011/User Story 2)
     002-transact's existing
     status==="active" check
     now excludes this Grant,
     no new check added — FR-012)
```

**Validation rule**: `RevocationService.respond()` MUST re-run the same `status === "active"`
check `request()` used (mirroring 002-transact's own respond-time re-check, research.md §5's
precedent) immediately before transitioning — a Grant could in principle have left `active` for
an unrelated reason (its own window elapsing) in the gap between request and respond.

## Entity: Credential *(from 001-grant — NOT read by this feature)*

Unlike 002-transact (which needed `identity.agentPublicKey` via a new `AgentKeyStore`),
003-revoke does not need the Credential at all. Revocation authenticates against the RP's own
`RegisteredPasskeyStore` entry for the account referenced by `GrantRecord.userPublicKeyRef` — the
same binding 001-grant's ceremony one already uses (`negotiation-service.ts`'s
`passkeyStore.getByAccountId(request.accountId)`, applied here via `record.userPublicKeyRef`
instead of a caller-supplied `accountId`, which is itself part of FR-006's protection: the caller
cannot claim a different account than the one the target Grant actually belongs to).

## Revocation Challenge state flow

```
        User requests revocation (grantNonce)
                       │
                       ▼
        Grant-state gate: status === "active"?  (FR-002)
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
       gate fails            gate passes
             │                   │
             ▼                   ▼
      deny, no challenge   issue RevocationChallenge
      issued                { challengeId, challenge,
                               grantNonce, issuedAt,
                               expiresAt, consumedAt: null }
                             — challenge scoped to the Grant
                             owner's specific credential
                             (research.md §2)               (FR-003)
                                    │
                                    ▼
                      User signs `challenge` via a standard
                      WebAuthn assertion (FR-004) — no scope/
                      duration content, unlike ceremony two
                                    │
                                    ▼
                RP: retrieveForVerification(challengeId)
                — consumedAt set NOW, before any other check
                (FR-007, Principle V NON-NEGOTIABLE)
                                    │
                      ┌─────────────┴─────────────┐
                      ▼                           ▼
            already consumed /              first-time
            not found → deny (FR-008)        retrieval
                                                    │
                                                    ▼
                                  re-check Grant status === "active"
                                  (data-model.md validation rule above)
                                  + signature verifies against the
                                  registered passkey for
                                  challenge.grantNonce's owner (FR-005)
                                                    │
                          ┌─────────────────────────┴─────────────────────────┐
                          ▼                                                     ▼
                    any check fails                                    all checks pass
                          ▼                                                     ▼
                    deny (status unchanged)                    transition Grant Record to
                                                                 `revoked` (FR-010); explicit
                                                                 revoked acknowledgment sent
                                                                 (FR-011)
```

Note: a second presentation of the same `challengeId` — whether the first attempt succeeded or
failed downstream — always hits the "already consumed" branch (FR-008, User Story 3 Scenario 2),
mirroring both prior features' proven-correct behavior for their own single-use artifacts.
