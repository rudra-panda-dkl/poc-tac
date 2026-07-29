# Phase 1 Data Model: TAC Grant Flow (001-grant)

Source: spec.md Key Entities section, cross-referenced with FR-006–FR-021. Types below live in
`packages/shared/src/credential.ts` unless noted, so `rp-server`, `user-client`, and
`agent-client` import the same shapes rather than maintaining parallel copies.

## Entity: Credential

The handoff contract for 002-transact and 003-revoke (spec.md Feature Boundary). Produced once,
at the end of ceremony two; immutable thereafter within this feature's scope.

| Field | Type | Notes |
|-------|------|-------|
| `identity.userPublicKey` | COSE public key (JSON, per WebAuthn attestation) | The User's registered passkey public key (FR-019); reference used for RP account lookup at activation (FR-009 path). |
| `identity.agentPublicKey` | JWK (ECDSA P-256 / ES256), JSON | Agent's locally-generated public key (FR-017); private key never appears in this or any other field. |
| `identity.rpIdentifier` | string | RP identifier the Agent was told at keypair-generation time (FR-018a). |
| `scope` | opaque, JSON-serializable object | Deterministically checkable by the RP (FR-020); contents undefined by this feature — 002-transact defines "in-scope" semantics. |
| `temporal.validFrom` | ISO 8601 timestamp | Start of credential validity. |
| `temporal.validUntil` | ISO 8601 timestamp | End of credential validity; MUST be later than `temporal.validFrom` and, per FR-012, the *nonce's* window (below) must be strictly shorter than this window, not the reverse. |
| `integrity.grantNonce` | string (opaque token) | The nonce issued at the end of ceremony one; single-use (FR-014/FR-015). |
| `integrity.assuranceLevel` | enum (RP-defined levels, e.g. `UP`, `UP+UV`) | Derived from ceremony one's signals (FR-006); covered by the User's signature (FR-008). |
| `integrity.userSignature` | WebAuthn assertion signature (bytes) | Signs the digest described below; produced in ceremony two (FR-003/FR-005). |

**Digest computation (FR-021, resolves OQ-6)**: `digest = SHA-256(JCS(canonicalSubset))` where
`canonicalSubset = { identity, scope, temporal, assuranceLevel: integrity.assuranceLevel,
grantNonce: integrity.grantNonce }` — i.e., every field except `integrity.userSignature` itself
(which cannot cover its own value). `JCS` is RFC 8785 via the `canonicalize` package
(research.md §2). This exact object shape and key set MUST be identical in
`packages/shared/src/canonicalize.ts`'s implementation on both the signing and verifying side.

**Validation rules**:
- All five top-level blocks (`identity`, `scope`, `temporal`, `integrity`) MUST be present
  (FR-019).
- `integrity.userSignature` MUST verify against `identity.userPublicKey` over the digest above.
- `integrity.assuranceLevel` MUST match the value the RP recorded on the corresponding Grant
  Record at negotiation time (FR-009) — checked at activation, not at signing.
- `integrity.grantNonce` MUST match the Grant Record retrieved by that nonce (see Grant Record
  transitions below), and that record MUST NOT already be consumed (FR-014/FR-015).

## Entity: Grant Record

RP-persisted, keyed by `nonce` (research.md §6: in-memory map, `rp-server` owned). The handoff
contract for 002-transact (reads `agreedScope`/`agreedDuration`/`status`) and 003-revoke (adds a
`revoked` status reachable from `active`).

| Field | Type | Notes |
|-------|------|-------|
| `nonce` | string | Map key; generated at end of ceremony one (FR-010). |
| `userPublicKeyRef` | reference/ID into RP's existing passkey registration store | Not the raw key material — a reference (FR-010). |
| `agreedScope` | same opaque shape as `Credential.scope` | Recorded at negotiation (FR-010), compared against the signed value at activation. |
| `agreedDuration.validFrom` / `agreedDuration.validUntil` | ISO 8601 timestamps | Recorded at negotiation; compared against `Credential.temporal` at activation. |
| `assuranceLevel` | same enum as `Credential.integrity.assuranceLevel` | Recorded at negotiation from ceremony one's signals (FR-006), bounded by the Assurance Ceiling Policy (FR-007a). |
| `nonceIssuedAt` | ISO 8601 timestamp | Set at record creation. |
| `nonceExpiresAt` | ISO 8601 timestamp | `nonceIssuedAt` + 5 minutes by default; RP-configurable per FR-012, always `< agreedDuration.validUntil`. |
| `status` | `'pending' \| 'active' \| 'expired'` (open enum — 003-revoke adds `'revoked'`) | See state machine below. |
| `consumedAt` | ISO 8601 timestamp \| `null` | Set the instant the nonce is retrieved for verification (FR-014), *before* any other check — this is what makes replay rejection (FR-015) possible regardless of downstream outcome. |

### State machine

```
        nonce issued (ceremony one ends)
                 │
                 ▼
             [pending] ──────────────────────────┐
                 │                                 │
   nonce retrieved for verification                │  nonce window elapses
   (consumedAt set immediately — FR-014)            │  before ceremony two completes
                 │                                 │  (FR-013)
                 ▼                                 ▼
     signature/terms/nonce/assurance          [expired]
     checks (FR-011, FR-009, User Story 2)
                 │
        ┌────────┴────────┐
        ▼                 ▼
   all checks pass    any check fails
        │                 │
        ▼                 ▼
    [active]          [pending]   (record NOT re-created or transitioned;
                                    FR-015/User Story 2 Scenario 5 — the
                                    consumed nonce simply can't be redeemed
                                    again, but status does not change on
                                    a failed attempt)
```

Note: a `pending` record whose nonce has already been consumed by a *failed* attempt is
functionally terminal (no future presentation of that nonce can succeed — FR-015), even though
its `status` field stays `pending` until the window elapses and it's swept to `expired`. Any
Grant Record query MUST treat `consumedAt !== null` as equivalent to "not redeemable," independent
of `status`.

## Entity: Assurance Ceiling Policy

RP-owned policy artifact introduced by the OQ-2 clarification (FR-007a). Not part of the
Credential or Grant Record handoff contracts — internal to `rp-server`.

| Field | Type | Notes |
|-------|------|-------|
| `ceilings` | `Map<AssuranceLevel, { maxDurationSeconds: number }>` | At minimum, a max permissible duration per assurance level. Concrete values are implementation-defined for this POC (not specified by spec.md) — `rp-server` ships a POC-reasonable default (see quickstart.md) that MAY be overridden via configuration. |

**Validation rule**: at negotiation, `rp-server` MUST refuse to agree to a duration exceeding
`ceilings.get(achievedAssuranceLevel).maxDurationSeconds` (FR-007a).

## Entity: User / Agent / RP (reference only, not persisted by this feature)

- **User**: identified to the RP solely via `identity.userPublicKey` / `userPublicKeyRef` above —
  no separate User record is introduced by this feature (passkey registration is a precondition,
  out of scope).
- **Agent**: identified solely via `identity.agentPublicKey`; the Agent's private key is generated
  and held in `agent-client`'s own process memory (research.md §4) and never modeled as data this
  feature persists or transmits.
- **RP**: single instance for this POC (Assumptions); modeled implicitly as the `rp-server`
  package's configuration (its own `rpIdentifier`, its Assurance Ceiling Policy), not as a
  database entity.
