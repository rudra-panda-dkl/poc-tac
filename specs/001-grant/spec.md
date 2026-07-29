# Feature Specification: TAC Grant Flow (Feature 1 of 3)

**Feature Branch**: `001-grant`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Grant/issuance flow for the Temporal Agent Credential (TAC) POC — the two-ceremony protocol (authenticating ceremony + local signing ceremony), the credential schema, assurance-bound scope, pending-grant state, and grant-time nonce replay protection. Maps to constitution Principles I–V. First of three features (001-grant, 002-transact, 003-revoke); its Credential and Grant Record shapes are depended on by the other two."

## Feature Boundary

This is **feature 1 of 3** covering the TAC POC. It specifies the grant/issuance flow only —
from the User's first passkey ceremony through the RP activating the grant. It explicitly does
**not** specify:

- **Transaction-time challenge-response** (the session-freshness half of constitution Principle
  VI) or any scope/window enforcement *at transaction time* — that belongs to **002-transact**.
- **Revocation** (Principle VIII) — that belongs to **003-revoke**.
- **Exception handling** (Principle IX) — that belongs to a later feature.
- **The internal contents of the scope block** (what makes a transaction "in-scope") — this
  feature only requires the scope block to exist, be signed, and be deterministically
  checkable in principle; defining *what* it checks against is 002-transact's concern.

This feature's outputs — the **Credential** and the **Grant Record** (see Key Entities) — are
the data shapes 002-transact and 003-revoke are built against. Their field shapes here are
intended to be stable handoff contracts, not placeholders.

## Clarifications

### Session 2026-07-20

- Q: Does ceremony two's digest-as-WebAuthn-challenge (no server round-trip) satisfy WebAuthn
  ceremony semantics as specified, or does it need non-standard handling? → A: Leave it
  unresolved at the spec level; gate it as a mandatory Phase 0 research spike in planning.
  FR-004 stands as specified, but `/speckit-plan` MUST validate actual WebAuthn conformance
  (real browser/authenticator behavior) before any grant-flow implementation proceeds, with a
  defined fallback path if validation fails.
- Q: Is the mapping from passkey assurance level to permissible scope/duration freeform
  per-grant negotiation, a defined policy/reference table, or a hybrid of the two? → A: Hybrid —
  a minimal, assurance-level-indexed ceiling (at minimum, a maximum permissible duration) bounds
  negotiation as a hard limit; within that ceiling, the specific scope and duration are
  negotiated freeform between RP and User as before. The concrete ceiling values themselves are
  not fixed by this clarification — only the mechanism is.
- Q: Does the Agent learn negotiated scope/duration informally before ceremony two, or remain
  blind to those terms until the finalized, signed credential is delivered? → A: Blind until
  delivery. The Agent receives only the RP identity at keypair-generation time (the unavoidable
  minimum for per-RP key scoping, FR-017/FR-018) — no scope or duration information reaches the
  Agent until the signed credential is delivered after ceremony two completes.
- Q: How is the opt-in per-credential Agent key variant triggered — a User-time choice, an RP
  policy, or an Agent capability flag? → A: Not implemented for this POC. Only the per-RP
  default (FR-018) is built; the per-credential opt-in variant is explicitly deferred beyond
  this POC's scope — there is no trigger mechanism because there is nothing to trigger.
- Q: Is the grant nonce's validity window a spec-fixed default, an RP-configurable value with no
  POC default, or a hybrid? → A: Hybrid — a spec-fixed default of **5 minutes**, which an RP MAY
  override with a different value as long as it still satisfies FR-012's "short and strictly
  shorter than the credential's own validity window" constraint.
- Q: What canonicalization/serialization format should the credential use before being hashed
  into ceremony two's signing digest? → A: JSON Canonicalization Scheme (RFC 8785 / JCS) —
  deterministic JSON serialization (sorted object keys, fixed number/string formatting) applied
  to the credential content prior to hashing.

## Open Questions (Deferred to Clarification)

The source proposal and comparison document name several points as explicitly unsettled. This
spec does not guess a resolution for any of them — each surfaces here for `/speckit-clarify`
rather than being silently decided. Functional requirements that depend on one are marked
inline with a `[NEEDS CLARIFICATION]` reference back to the matching item.

- ~~**OQ-1 — WebAuthn digest-as-challenge conformance.**~~ **RESOLVED — see Clarifications,
  Session 2026-07-20.** Not settled as a fact, but the spec's stance is: FR-004 stands as
  written, and conformance MUST be validated as a Phase 0 planning spike before implementation,
  with a fallback path defined if it fails. *Source: TAC_Proposal_Draft.md §13 Q1;
  TAC_vs_DPoP_Writeup.md §6 Q1.*
- ~~**OQ-2 — Assurance-to-scope mapping.**~~ **RESOLVED — see Clarifications, Session
  2026-07-20.** Hybrid: an assurance-level-indexed ceiling bounds negotiation as a hard limit;
  specifics within that ceiling remain freeform. Concrete ceiling values are still undefined —
  that's implementation-level policy configuration for this POC, not a further open spec
  question. *Source: TAC_Proposal_Draft.md §13 Q2.*
- ~~**OQ-3 — Agent's early visibility into negotiated terms.**~~ **RESOLVED — see
  Clarifications, Session 2026-07-20.** Blind until delivery: the Agent receives only the RP
  identity at keypair-generation time; scope and duration are withheld until the signed
  credential is delivered. *Source: TAC_Proposal_Draft.md §13 Q5.*
- ~~**OQ-4 — Per-RP vs. per-credential Agent key opt-in mechanics.**~~ **RESOLVED — see
  Clarifications, Session 2026-07-20.** Not implemented for this POC — only the per-RP default
  is built; the per-credential opt-in variant is deferred beyond this POC's scope entirely.
  *Source: TAC_Proposal_Draft.md §13 Q6.*
- ~~**OQ-5 — Nonce validity window duration.**~~ **RESOLVED — see Clarifications, Session
  2026-07-20.** Hybrid: 5-minute spec-fixed default, RP-overridable within FR-012's bound.
  *Source: TAC_Proposal_Draft.md §13 Q8.*
- ~~**OQ-6 — Credential canonicalization for the signing digest.**~~ **RESOLVED — see
  Clarifications, Session 2026-07-20.** JSON Canonicalization Scheme (RFC 8785 / JCS): the
  credential's `identity`, `scope`, `temporal`, `assuranceLevel`, and `grantNonce` fields are
  serialized via JCS before hashing into the digest used as ceremony two's WebAuthn challenge,
  giving both the User's signing side and the RP's re-verification side a byte-for-byte
  reproducible input. *Source: gap identified while drafting this spec — not named as an open
  question in either source document.*

## User Scenarios & Testing *(mandatory)*

### User Story 1 - User Grants a Temporal Credential to an Agent (Priority: P1)

A User who already has a registered passkey with the RP authorizes a specific Agent to act on
their behalf at that RP, for an agreed scope and duration, using two passkey ceremonies bound
together by a single RP-issued nonce: the first ceremony authenticates and negotiates terms; the
second signs the finished credential locally, with no further server round-trip.

**Why this priority**: this is the entire feature — the grant is the artifact everything else in
the POC depends on.

**Independent Test**: run the flow end-to-end (authenticate → negotiate → nonce issuance → Agent
keypair generation → sign credential → present → RP activates) and confirm the RP's persisted
record reaches status `active` with the correct scope, duration, and assurance level.

**Acceptance Scenarios**:

1. **Given** a User with a registered passkey at the RP and no prior grant to this Agent,
   **When** the User completes ceremony one (authentication) and the RP negotiates scope and
   duration — bounded by the assurance-level ceiling in effect for the achieved assurance level
   (FR-007a) — and issues a grant nonce, **Then** the RP persists a Grant Record with status
   `pending`, containing the agreed terms and the nonce, and no `active` grant exists yet.
2. **Given** a `pending` Grant Record exists, **When** the Agent is told only the RP identity
   (per Clarifications, Session 2026-07-20 — not the negotiated scope or duration) and generates
   its own keypair locally, presenting its public key toward assembly of the credential, **Then**
   that public key becomes part of the credential's identity block, the private key never leaves
   the Agent, and the Agent still has no visibility into the agreed scope or duration.
3. **Given** the credential is assembled (identity, scope, temporal, and integrity blocks,
   including the RP-issued nonce), **When** the User completes ceremony two — signing the
   credential digest with no further server round-trip — **Then** a validly signed credential
   is produced whose signed content includes the User public key, Agent public key, RP
   identifier, scope, temporal window, grant nonce, and the assurance level achieved in ceremony
   one, and that signed credential is delivered to the Agent — the first point at which the
   Agent learns the actual scope, duration, and other negotiated terms it is bound by (per
   Clarifications, Session 2026-07-20).
4. **Given** a validly signed credential is presented by the Agent to the RP, **When** the RP
   looks up the User's public key from its own passkey registration record, confirms account
   match, validates the signature and terms against the `pending` Grant Record, confirms the
   nonce matches, and confirms the signed assurance level matches what was recorded at
   negotiation, **Then** the RP flips the Grant Record's status to `active` and acknowledges the
   grant to the Agent.

---

### User Story 2 - Grant Attempt Aborts Cleanly on Any Validation Failure (Priority: P1)

Any single failed check during credential presentation — account lookup miss, invalid signature,
nonce mismatch, terms mismatch — aborts the grant attempt entirely, leaving no record persisted
or activated as a side effect of the failed attempt.

**Why this priority**: a grant that can be partially or ambiguously activated on a failed check
undermines every downstream guarantee the Credential and Grant Record are meant to provide to
002-transact and 003-revoke; this must hold as reliably as the happy path.

**Independent Test**: seed a `pending` Grant Record directly (without running Story 1's full
negotiation) and present it with each category of invalid credential in turn; confirm none
result in an `active` record and no new record is created as a byproduct of the failed attempt.

**Acceptance Scenarios**:

1. **Given** a `pending` Grant Record, **When** a presented credential's User public key does
   not match the RP's own passkey registration record for the claimed account, **Then** the RP
   aborts the grant attempt and the record remains `pending`.
2. **Given** a `pending` Grant Record, **When** a presented credential's signature fails
   validation, **Then** the RP aborts the grant attempt and the record remains `pending`.
3. **Given** a `pending` Grant Record, **When** a presented credential embeds a nonce that does
   not match the record's own nonce, **Then** the RP aborts the grant attempt and the record
   remains `pending`.
4. **Given** a `pending` Grant Record, **When** a presented credential's scope, duration, or
   assurance level does not match what was recorded at negotiation, **Then** the RP aborts the
   grant attempt and the record remains `pending`.
5. **Given** any of the above abort conditions, **When** the failure occurs, **Then** the RP
   creates no additional Grant Record and does not transition any record to `active` as a result
   of the failed attempt.

---

### User Story 3 - Grant Nonce Is Provably Single-Use (Priority: P1)

The grant-time nonce, once retrieved for verification, cannot be redeemed a second time —
whether the first presentation succeeded or failed a later check — and cannot be redeemed at all
once its bounded validity window has elapsed.

**Why this priority**: this validates a non-negotiable constitution principle (V) and the
grant-nonce half of Principle VI; if this doesn't hold, the entire grant mechanism's replay
defense fails regardless of whether the happy path works.

**Independent Test**: seed a `pending` Grant Record with a known nonce; attempt to redeem it
twice under each of three conditions (first attempt succeeds, first attempt fails a downstream
check, nonce's validity window has elapsed) and confirm the second attempt is always rejected.

**Acceptance Scenarios**:

1. **Given** a grant nonce that has already been successfully redeemed (the Grant Record is now
   `active`), **When** a second credential presentation references the same nonce, **Then** the
   RP rejects it.
2. **Given** a grant nonce presented in a credential that fails a downstream check (e.g., an
   invalid signature), **When** the same nonce is presented again — even before its validity
   window has elapsed, **Then** the RP rejects the second attempt too, because the nonce was
   marked consumed at retrieval time, not at successful-verification time.
3. **Given** a `pending` Grant Record whose nonce validity window has elapsed before ceremony
   two completes, **When** the Agent presents a credential referencing that nonce, **Then** the
   RP rejects it as expired and the Grant Record transitions to `expired`, not `active`.

---

### Edge Cases

- What happens when the Agent's public key presented during assembly does not match the key
  later found inside the RP-validated credential (e.g., substituted after signing)? The User's
  signature covers the Agent public key, so the RP's signature validation (User Story 2,
  Scenario 2) must catch this as an invalid signature — it is not a separate check.
- What happens to a `pending` Grant Record if the User never returns to complete ceremony two at
  all? It transitions to `expired` per its bounded nonce window (User Story 3, Scenario 3) — no
  explicit cancellation action is required.
- What happens if a User initiates a second grant negotiation for the same Agent and RP while an
  earlier `pending` or `active` Grant Record for that same pairing already exists? **Not
  addressed by this feature** — concurrent or overlapping negotiations for the same User+Agent+RP
  triple are not specified here and would need a product decision before implementation; this is
  distinct from the six numbered Open Questions above because it wasn't named as unsettled in
  either source document, it's a gap this spec is flagging as unaddressed rather than resolving.
- How is the credential digest computed identically on the User's signing side and the RP's
  re-verification side? Resolved — see OQ-6: both sides serialize the credential content via
  JCS (RFC 8785) before hashing.
- What happens if the Agent would have declined the grant had it known the terms earlier (per
  the blind-until-delivery resolution of OQ-3)? This feature provides no fail-fast path — the
  Agent only learns terms once the grant is already `active`. If the terms are unsuitable, the
  only recourse is the constitution's existing revoke-then-re-grant non-goal path (003-revoke's
  concern), not a decline mechanism within this feature.

## Requirements *(mandatory)*

### Functional Requirements

**Principle I — Authentication Is Not Delegation**

- **FR-001**: The grant flow MUST NOT issue, rely on, or produce an OAuth-style bearer token or
  any other delegation/authorization artifact as part of activating a grant; activation MUST be
  representable purely as the Grant Record's status transition to `active`.
- **FR-002**: The User↔RP negotiation and User↔Agent handoff mechanisms used in this flow MUST
  be bespoke, RP-local mechanisms and MUST NOT be presented as, or required to conform to, any
  standards-conformant external authorization interface.

**Principle II — Two-Ceremony, One-Round-Trip Grant Protocol**

- **FR-003**: The grant flow MUST require exactly two distinct WebAuthn ceremonies from the
  User: one authenticating ceremony with a server-issued challenge, and one signing ceremony
  whose challenge is the credential digest itself.
- **FR-004**: The second (signing) ceremony MUST NOT require an additional server round-trip to
  fetch a fresh challenge; freshness MUST be inherited from the nonce issued during the first
  ceremony. *(Per Clarifications, Session 2026-07-20: this requirement stands as specified, but
  its WebAuthn conformance is unproven — `/speckit-plan` MUST treat validating it as a Phase 0
  gate, with a defined fallback if validation fails, before grant-flow implementation proceeds.)*
- **FR-005**: The User's signature over the credential MUST be produced through a standard
  WebAuthn assertion ceremony; the flow MUST NOT implement a separate, non-WebAuthn signing
  mechanism for this step.

**Principle III — Assurance-Bound, Signed Scope**

- **FR-006**: The RP MUST derive the assurance level from the UP/UV signals of the User's first
  (authenticating) ceremony.
- **FR-007**: The scope and duration the RP agrees to during negotiation MUST be recorded as a
  function of that assurance level. *(Per Clarifications, Session 2026-07-20: enforced via a
  hard assurance-level ceiling, with freeform negotiation permitted within it — see FR-007a.)*
- **FR-007a**: The RP MUST maintain an assurance-level-indexed ceiling (at minimum, a maximum
  permissible duration per assurance level) as a POC-owned policy artifact, and MUST refuse to
  negotiate terms that exceed the ceiling for the assurance level achieved in ceremony one.
  Concrete ceiling values are implementation-defined for this POC and are not specified by this
  spec.
- **FR-008**: The assembled credential MUST include the assurance level as a field covered by the
  User's WebAuthn signature, alongside the identity, scope, and temporal blocks.
- **FR-009**: At grant activation, the RP MUST confirm the credential's signed assurance level
  matches what the RP recorded during negotiation, and MUST refuse activation on mismatch.

**Principle IV — Bounded Pending-Grant State**

- **FR-010**: The RP MUST persist a Grant Record with status `pending` at the moment the grant
  nonce is issued, containing at minimum the User public-key reference, agreed scope, agreed
  duration, and the nonce.
- **FR-011**: The RP MUST transition a `pending` Grant Record to `active` only after successfully
  validating the second ceremony's signed credential against that same record.
- **FR-012**: The grant nonce MUST carry a validity window that is both short and strictly
  shorter than the credential's own `validFrom`/`validUntil` window. *(Per Clarifications,
  Session 2026-07-20 — resolves OQ-5.)* The default window MUST be **5 minutes**; an RP MAY
  configure a different value as long as it still satisfies the short-and-strictly-shorter
  constraint above.
- **FR-013**: If the second ceremony does not complete within the nonce's validity window, the
  RP MUST transition the Grant Record to `expired` and MUST refuse to redeem that nonce
  afterward.

**Principle V — Single-Use Artifact Consumption Ordering, and the Grant-Nonce Half of Principle
VI's Dual-Layer Replay Protection**

- **FR-014**: The RP MUST mark the grant nonce as consumed at the moment it is retrieved for
  verification, before evaluating any other check (signature, terms, account lookup).
- **FR-015**: The RP MUST reject any subsequent presentation of an already-consumed grant nonce,
  regardless of whether the presentation that consumed it succeeded or failed downstream.
- **FR-016**: The grant-nonce replay protection specified here MUST be implemented as a
  mechanism distinct and independently verifiable from transaction-time freshness — this feature
  implements only the grant-nonce layer; the transaction-time layer is 002-transact's
  responsibility and is out of scope here.

**Principle VII — Agent-Held Keys, Never Custodied (grant-time keypair generation only)**

- **FR-017**: The Agent MUST generate its own keypair locally during this flow; the private key
  MUST NOT be transmitted to, or observable by, the User or the RP at any point.
- **FR-018**: This flow MUST scope one Agent keypair per RP; this is the only key-scoping mode
  this feature implements. *(Per Clarifications, Session 2026-07-20 — resolves OQ-4: the
  constitution's opt-in per-credential-key variant is explicitly deferred beyond this POC's
  scope. No opt-in trigger, configuration, or code path for it exists in this feature.)*
- **FR-018a** *(per Clarifications, Session 2026-07-20 — resolves OQ-3)*: Before the signed
  credential is delivered, the flow MUST NOT disclose the negotiated scope or duration to the
  Agent; the only information the Agent MAY receive prior to delivery is the RP identity
  necessary to scope its keypair (FR-017/FR-018). The Agent's first visibility into scope and
  duration MUST be the signed credential itself.

**Cross-Cutting — Credential Structure**

- **FR-019**: The credential MUST contain, at minimum, an identity block (User public key, Agent
  public key, RP identifier), a scope block, a temporal block (`validFrom`/`validUntil`), and an
  integrity block (grant nonce, User signature, assurance level).
- **FR-020**: The scope block MUST be a structure the RP can evaluate deterministically at a
  later time (002-transact's concern); this feature requires only that the block exists, is
  covered by the User's signature, and is opaque/well-formed — it does not define what "in-scope"
  means.
- **FR-021**: The mechanism for computing the credential digest used as the WebAuthn challenge in
  ceremony two MUST be deterministic given the same credential content. *(Per Clarifications,
  Session 2026-07-20 — resolves OQ-6.)* The credential content MUST be serialized via the JSON
  Canonicalization Scheme (RFC 8785 / JCS) before being hashed into the digest, so the User's
  signing side and the RP's re-verification side derive byte-for-byte identical input.

### Key Entities

- **User**: the human Issuer. Represented to the RP by a passkey public key already on file from
  a prior registration (precondition — enrollment itself is out of scope). Authenticates in
  ceremony one and signs the credential in ceremony two.
- **Agent**: the software Holder acting on the User's behalf. Generates its own keypair locally
  during this flow (never custodied by User or RP); identified in the credential by its public
  key. Key scope is one keypair per RP — the only mode this feature implements (per
  Clarifications, Session 2026-07-20; the per-credential opt-in variant is out of scope for this
  POC).
- **RP (Relying Party)**: the single Verifier for this POC. Known to the User via an existing
  passkey relationship (external precondition); negotiates scope/duration, persists Grant
  Records, and validates presented credentials.
- **Credential** *(handoff contract for 002-transact and 003-revoke)*: the temporal Verifiable
  Credential issued by the User to the Agent's public key. Fields:
  - `identity`: `{ userPublicKey, agentPublicKey, rpIdentifier }`
  - `scope`: an opaque, deterministically-checkable structure representing agreed business/
    transaction boundaries — contents defined by 002-transact, not this feature
  - `temporal`: `{ validFrom, validUntil }`
  - `integrity`: `{ grantNonce, assuranceLevel, userSignature }`, where `userSignature` is the
    WebAuthn assertion signature covering the digest of the `identity`, `scope`, `temporal`, and
    `assuranceLevel` fields plus `grantNonce`, JCS-serialized (RFC 8785) before hashing (per
    Clarifications, Session 2026-07-20 — resolves OQ-6; FR-021)
  - RP-local; scoped to exactly one User identity, one Agent identity, one RP, one time window;
    not designed for multi-verifier or long-lived reuse.
- **Grant Record** *(handoff contract for 002-transact and 003-revoke)*: the RP-persisted record
  for a grant, keyed by the grant nonce. Fields:
  - `nonce`: the grant-time nonce (record key)
  - `userPublicKeyRef`: reference to the User's registered passkey public key
  - `agreedScope`, `agreedDuration` (`validFrom`/`validUntil`): the negotiated terms
  - `assuranceLevel`: the level recorded at negotiation, compared against the credential's
    signed value at activation
  - `nonceIssuedAt`, `nonceExpiresAt`: bounds of the nonce's validity window; `nonceExpiresAt`
    defaults to `nonceIssuedAt` + 5 minutes unless the RP is configured with a different bounded
    value (FR-012)
  - `status`: one of `pending` (nonce issued, ceremony two not yet validated), `active`
    (ceremony two validated and matched), `expired` (nonce window elapsed before validation).
    This feature defines only these three values; 003-revoke adds a further `revoked` transition
    reachable from `active` — the field is intentionally an open enum, not a closed one, so that
    addition doesn't require redefining the record.
- **Assurance Ceiling Policy** *(introduced by Clarifications, Session 2026-07-20)*: an RP-owned
  policy artifact mapping each assurance level to a ceiling — at minimum, a maximum permissible
  grant duration — that bounds what negotiation (User Story 1, Scenario 1) is allowed to agree
  to. Only the mechanism is fixed here; the concrete ceiling values are implementation-defined
  for this POC, not specified by this spec.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A User can complete a full grant (both ceremonies) to authorize one Agent for one
  RP, scope, and duration, with no more than one network round-trip to the RP required to
  establish a fresh, verifiable challenge across the entire flow.
- **SC-002**: 100% of credential presentations carrying a mismatched, expired, or
  already-consumed grant nonce are rejected by the RP, with no Grant Record reaching `active` as
  a result.
- **SC-003**: 100% of credential presentations with an invalid signature, an account-lookup
  mismatch, or a terms mismatch against the `pending` record are rejected, with no Grant Record
  reaching `active` as a result and no additional record created as a side effect.
- **SC-004**: For every Grant Record that reaches `active`, the assurance level recorded at
  negotiation is verifiably identical to the assurance level carried as a signed field in the
  presented credential.
- **SC-005**: No Grant Record reaches `active` status without both ceremonies having been
  completed and validated in sequence — there is no path that transitions a record directly to
  `active` on the strength of ceremony one alone.
- **SC-006**: An Agent private key is never observed on the wire, or in RP-side or User-side
  storage, at any point during the flow.
- **SC-007**: Every attempted replay of an already-consumed grant nonce is rejected, including
  replays that follow a failed downstream check on the first attempt, not only replays that
  follow a success.
- **SC-008**: 100% of negotiated durations comply with the assurance-level ceiling in effect at
  negotiation time; zero Grant Records reach `active` with a duration exceeding the ceiling for
  the assurance level actually achieved.
- **SC-009**: Across all grant attempts, zero instances of scope or duration information reach
  the Agent prior to signed-credential delivery — the only pre-delivery information observed by
  the Agent is the RP identity.
- **SC-010**: Under the default configuration, a grant nonce is redeemable for exactly 5 minutes
  from issuance; 100% of ceremony-two completions attempted after that window has elapsed are
  rejected, and the same enforcement holds at whatever bounded value an RP configures instead.

## Assumptions

- The POC targets a single RP instance; multi-RP or multi-agent identity federation is out of
  scope (per constitution non-goals).
- The Agent is software, not a human, and its role in this feature ends once the grant is
  `active`; what the Agent does with an active grant is 002-transact's concern.
- Every scenario assumes the User already has an established passkey relationship with the RP
  before the scenario begins — first-time passkey enrollment is a precondition, not a flow this
  feature implements.
- The scope block's internal expressiveness (transaction types, amount limits, or both) is
  deliberately left undefined here, as an assumption rather than an open question — this feature
  treats it as opaque, and 002-transact is expected to define it when specifying what "in-scope"
  checking means.
- Amendment of an active grant is out of scope for this feature entirely (per constitution
  non-goal); no amendment-related capability is implied by anything in this spec.
- The constitution's opt-in per-credential Agent key variant (Principle VII) is not built by
  this POC at all (per Clarifications, Session 2026-07-20, resolving OQ-4) — every Agent
  keypair in this feature is scoped per-RP, with no exception path.
