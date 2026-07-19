# Feature Specification: Temporal Agent Credential (TAC) POC

**Feature Branch**: `001-temporal-agent-credential`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Temporal Agent Credential (TAC) POC — demonstrate the grant, transaction, and revocation lifecycle described in docs/TAC_Proposal_Draft.md and docs/TAC_vs_DPoP_Writeup.md, organized around the three actors (User, Agent, RP) and the 9 constitution principles in .specify/memory/constitution.md."

## Open Questions (Deferred to Clarification)

The source proposal and comparison document each name several points as explicitly unsettled.
This spec does **not** guess a resolution for any of them — each is carried forward here so it
surfaces during `/speckit-clarify` rather than being silently decided. Functional requirements
below that depend on one of these are marked inline with a `[NEEDS CLARIFICATION]` reference
back to the matching item.

- **OQ-1 — WebAuthn digest-as-challenge conformance.** Does presenting the credential digest as
  the WebAuthn challenge for the second (signing) ceremony — with no server round-trip —
  satisfy WebAuthn ceremony semantics as currently specified, or does it require a new WebAuthn
  extension? *Source: TAC_Proposal_Draft.md §13 Q1; TAC_vs_DPoP_Writeup.md §6 Q1. Impact:
  foundational — if this doesn't hold as specified, the signing mechanism itself needs rework.*
- **OQ-2 — Assurance-to-scope mapping.** Is the mapping from passkey assurance level to
  permissible scope/duration left entirely to per-grant RP/User negotiation, or does the POC
  need a defined policy structure (e.g., a reference table)? *Source: TAC_Proposal_Draft.md §13
  Q2. Impact: this is TAC's core differentiator — without a defined mechanism, "assurance-bound
  scope" is a principle without machinery to test against.*
- **OQ-3 — Scope-block expressiveness.** What must the credential's scope block be able to
  express — transaction types, amount/value limits, both, at what granularity? *Source:
  TAC_Proposal_Draft.md §13 Q4. Impact: determines what "deterministic in/out-of-scope
  evaluation" actually tests against.*
- **OQ-4 — Agent's early visibility into terms.** Does the Agent learn scope/duration
  informally as soon as the User is informed (so it can fail fast on unsuitable terms), or does
  it remain blind to those terms until the finalized, signed credential is delivered (stricter
  minimal-disclosure posture)? *Source: TAC_Proposal_Draft.md §13 Q5. Impact: affects the
  sequencing of the grant journey and what the Agent may observe before completion.*
- **OQ-5 — Per-credential vs. per-RP Agent key opt-in mechanics.** The constitution fixes
  one-keypair-per-RP as the default; the mechanics/trigger for the opt-in per-credential-keypair
  variant are undefined — a User-time choice, an RP policy, an Agent capability flag? *Source:
  TAC_Proposal_Draft.md §13 Q6.*
- **OQ-6 — Standardized vs. RP-discretionary exception conditions.** Should the set of
  conditions that count as an "exception" requiring human re-involvement be fixed by this spec,
  or left entirely to RP-defined risk policy? *Source: TAC_Proposal_Draft.md §13 Q7. Impact:
  determines whether exception handling has a spec-verifiable boundary or is inherently
  RP-specific and only demonstrable, not verifiable against a fixed spec.*
- **OQ-7 — Pending-grant nonce window default.** What is the actual duration of the grant
  nonce's bounded validity window — a spec-fixed default, or an RP-configurable policy value
  with no POC default? *Source: TAC_Proposal_Draft.md §13 Q8. Impact: the pending-state
  requirements cannot be tested against a concrete time bound until this is set.*
- **OQ-8 — Credential canonicalization for the signing digest.** Neither source document
  specifies how the credential's content is canonicalized/serialized before being hashed into
  the digest used as the second ceremony's WebAuthn challenge. *Source: gap identified while
  drafting this spec — not named as an open question in either source document. Impact: the
  digest cannot be computed deterministically, and what the User signs must match what the RP
  later re-derives and re-verifies, byte for byte.*
- **OQ-9 — Behavior when a task outlives its signed duration window.** When an Agent's
  in-progress task outlives the credential's `validUntil`, should the POC support any
  re-negotiation path, or is a hard stop (transaction denial, no automatic renewal) the entire
  story? *Source: TAC_vs_DPoP_Writeup.md §6, Open Design Choice #3.*

## User Scenarios & Testing *(mandatory)*

### User Story 1 - User Grants a Temporal Credential to an Agent (Priority: P1)

A User who already has a registered passkey with the RP authorizes a specific Agent to act on
their behalf at that RP, for an agreed scope and duration, using two passkey ceremonies bound
together by a single RP-issued nonce — the first ceremony authenticates and negotiates terms,
the second signs the finished credential without a further server round-trip.

**Why this priority**: nothing else in the POC has anything to operate on without a completed
grant — this is the foundational capability the rest of the system depends on.

**Independent Test**: run the grant flow end-to-end (authenticate → negotiate → nonce issuance
→ agent keypair generation → sign credential → present → RP activates) and confirm the RP's
persisted record reaches status `active` with the correct scope, duration, and assurance level,
without invoking any other capability of the POC.

**Acceptance Scenarios**:

1. **Given** a User with a registered passkey at the RP and no prior grant to this Agent,
   **When** the User completes ceremony one (authentication) and the RP negotiates scope and
   duration and issues a grant nonce, **Then** the RP persists a `pending` record containing the
   agreed terms and nonce, and no `active` grant exists yet.
2. **Given** a `pending` record exists and the Agent has generated its keypair and presented its
   public key to the User, **When** the User assembles the credential — embedding the RP-issued
   nonce — and completes ceremony two (signing) with no further server round-trip, **Then** a
   validly signed credential is produced whose signed content includes the User public key,
   Agent public key, RP identifier, scope, temporal window, and the assurance level achieved in
   ceremony one.
3. **Given** a validly signed credential is presented by the Agent to the RP, **When** the RP
   looks up the User's public key from its own passkey registration record, confirms account
   match, validates the signatures and terms against the `pending` record, confirms the nonce
   matches, and confirms the signed assurance level matches what was recorded at negotiation,
   **Then** the RP flips the record's status to `active` and acknowledges the grant to the Agent.
4. **Given** any single check in Scenario 3 fails (account lookup miss, invalid signature, nonce
   mismatch, terms mismatch), **When** the RP evaluates the presented credential, **Then** no
   record is persisted or activated and the grant attempt is aborted.
5. **Given** a `pending` record whose nonce validity window has elapsed before ceremony two
   completes, **When** the Agent later presents a credential referencing that nonce, **Then**
   the RP rejects it as expired and the pending grant does not activate.

---

### User Story 2 - Agent Transacts Within Granted Scope (Priority: P1)

An Agent holding an active grant performs a transaction at the RP using live challenge-response
proof-of-possession of its own private key — with no human presence or passkey ceremony
involved at this step, and no repeated human approval for routine in-scope activity.

**Why this priority**: this is the core value proposition — an Agent acting on an active grant
without repeated human involvement, while remaining provably bound to a live key on every use.

**Independent Test**: seed the RP with a pre-established `active` grant record and an Agent
holding the matching private key; exercise transaction requests directly, without first running
the full grant flow.

**Acceptance Scenarios**:

1. **Given** an `active` grant that is in-scope and in-window, **When** the Agent requests a
   transaction, **Then** the RP issues a fresh challenge, the Agent signs it with its private
   key, and the RP validates the signature and freshness before permitting the transaction.
2. **Given** the same active grant, **When** the Agent successfully completes one transaction,
   **Then** a subsequent transaction still requires a newly issued challenge — the previously
   used challenge is not accepted again.
3. **Given** a transaction request that falls outside the credential's agreed scope, **When**
   the RP evaluates it against the persisted terms, **Then** the RP denies the transaction
   without executing it, regardless of whether the live challenge-response would otherwise have
   succeeded.
4. **Given** a transaction request made after the credential's `validUntil`, **When** the RP
   checks the window, **Then** the RP denies the transaction as expired.

---

### User Story 3 - User Revokes an Active Grant (Priority: P2)

A User halts an Agent's active grant at will, and the RP enforces that halt on the very next
transaction attempt with no propagation delay, attempting rollback of any in-flight transaction
within the bounds of its own transaction semantics.

**Why this priority**: an essential safety mechanism, but it depends on an active grant already
existing (User Story 1) to have something to revoke.

**Independent Test**: seed an `active` grant record; call the revocation endpoint as the User
and confirm the record flips to `revoked` synchronously and subsequent transaction attempts are
denied — independent of how the grant was originally created.

**Acceptance Scenarios**:

1. **Given** an `active` grant, **When** the User calls the RP's revocation endpoint and
   authenticates with a challenge cryptographically bound to that specific credential, **Then**
   the RP flips the persisted record's status to `revoked` immediately.
2. **Given** a just-revoked grant, **When** the Agent attempts a transaction (in-flight or
   newly initiated), **Then** the RP denies it via a synchronous status check — no propagation
   delay — and signals a halt to the Agent.
3. **Given** a revoked grant with an in-flight transaction, **When** the RP processes the halt,
   **Then** the RP attempts rollback, and the outcome — success or bounded failure — is
   determined by the RP's own transaction semantics, not guaranteed by the POC.
4. **Given** a revocation challenge captured for credential A, **When** it is replayed against a
   different credential B held by the same User at the same RP, **Then** the RP rejects it.

---

### User Story 4 - RP Handles Exception Conditions (Priority: P2)

The RP distinguishes routine in-scope transactions — which require no human involvement — from
exception conditions (out-of-scope request, expired window, anomalous pattern), which put the
human back in the loop.

**Why this priority**: this operationalizes the "provenance over correctness, humans-in-the-loop
for exceptions only" principle; it depends on an active grant existing to have transactions to
evaluate against.

**Independent Test**: drive each exception category (out-of-scope, expired window, anomalous
pattern) against a seeded active grant and confirm each is surfaced distinctly from a routine
denial, without needing the full grant or revocation flows.

**Acceptance Scenarios**:

1. **Given** an active, in-window grant, **When** the Agent requests a transaction outside the
   agreed scope, **Then** the RP denies it and flags the condition as an out-of-scope exception,
   distinguishable from a routine failure.
2. **Given** a grant whose window has expired, **When** the Agent requests a transaction,
   **Then** the RP denies it and flags the condition as an expired-window exception.
3. **Given** a transaction request the RP's own risk logic considers anomalous relative to the
   agreed terms, **When** the RP evaluates it, **Then** the RP treats it as an exception
   requiring the human to be back in the loop before proceeding. *(The exact anomaly criteria
   used here are RP-defined for this POC — see OQ-6.)*

---

### User Story 5 - Single-Use Artifacts Are Provably Rejected on Replay (Priority: P1)

Every single-use artifact in the system — grant nonce, transaction challenge, revocation
challenge — is consumed at the moment it is retrieved for verification, not only on successful
verification, so that no artifact is ever usable a second time regardless of why the first
attempt didn't result in activation.

**Why this priority**: this validates two non-negotiable constitution principles (V and VI); if
this doesn't hold, the POC's core security argument fails regardless of whether the happy paths
work.

**Independent Test**: for each single-use artifact type, attempt a same-artifact replay after
both a successful and a failed downstream check, and confirm rejection in both cases —
independent of the other stories' full flows.

**Acceptance Scenarios**:

1. **Given** a grant nonce that has already been successfully redeemed (the grant is `active`),
   **When** a second credential presentation references the same nonce, **Then** the RP rejects
   it.
2. **Given** a grant nonce presented in a credential that fails a downstream check (e.g., an
   invalid signature), **When** the same nonce is presented again — even before its validity
   window expires, **Then** the RP rejects the second attempt too, because the nonce was marked
   consumed at retrieval time, not at successful-verification time.
3. **Given** a transaction challenge that was already responded to — successfully or not,
   **When** the same challenge value is presented again, **Then** the RP rejects it.
4. **Given** a revocation challenge that was already used — successfully or not, **When** it is
   presented again, **Then** the RP rejects it.

---

### Edge Cases

- What happens when the Agent's public key presented to the User does not match the key later
  found inside the RP-validated credential (e.g., substituted after signing)? The User's
  signature covers the Agent public key, so the RP's signature validation must catch this as an
  invalid signature, not a separate check.
- What happens when a User attempts to change an active grant's scope or duration? The
  constitution treats this as out of scope for in-place mutation — only revoke-then-re-grant is
  supported (see FR-030). This is a settled non-goal, not an open question.
- What happens to a `pending` record if the User never returns to complete ceremony two at all?
  It expires per its bounded nonce window (User Story 1, Scenario 5) — no explicit cancellation
  action is required.
- How is the credential digest computed identically on the User's signing side and the RP's
  re-verification side? Unresolved — see OQ-8.
- Does an Agent whose task will clearly outlive the granted window get any assistance before
  hitting a hard denial, or is denial-at-expiry the entire story? Unresolved — see OQ-9.

## Requirements *(mandatory)*

### Functional Requirements

**Principle I — Authentication Is Not Delegation**

- **FR-001**: The RP MUST treat the Agent's live challenge-response transaction mechanism (User
  Story 2) as distinct from, and never a substitute for, an authorization/delegation token; the
  POC MUST NOT gate transactions on an OAuth-style bearer token.
- **FR-002**: The User↔RP negotiation, User↔Agent handoff, and RP-local revocation endpoints
  MUST be implemented as bespoke, RP-local mechanisms and MUST NOT be presented as, or required
  to conform to, any standards-conformant external authorization interface.

**Principle II — Two-Ceremony, One-Round-Trip Grant Protocol**

- **FR-003**: The grant flow MUST require exactly two distinct WebAuthn ceremonies from the
  User: one authenticating ceremony with a server-issued challenge, and one signing ceremony
  whose challenge is the credential digest itself.
- **FR-004**: The second (signing) ceremony MUST NOT require an additional server round-trip to
  fetch a fresh challenge; freshness MUST be inherited from the nonce issued during the first
  ceremony. *[NEEDS CLARIFICATION: see OQ-1 — whether this satisfies WebAuthn ceremony semantics
  as specified is unresolved.]*
- **FR-005**: The User's signature over the credential MUST be produced through a standard
  WebAuthn assertion ceremony; the POC MUST NOT implement a separate, non-WebAuthn signing
  mechanism for this step.

**Principle III — Assurance-Bound, Signed Scope**

- **FR-006**: The RP MUST derive the assurance level from the UP/UV signals of the User's first
  (authenticating) ceremony.
- **FR-007**: The scope and duration the RP agrees to MUST be recorded as a function of that
  assurance level. *[NEEDS CLARIFICATION: see OQ-2 — the mapping from assurance level to
  permissible scope/duration is not defined by either source document.]*
- **FR-008**: The assembled credential MUST include the assurance level as a field covered by
  the User's WebAuthn signature, alongside the identity, scope, and temporal blocks.
- **FR-009**: At grant activation, the RP MUST confirm the credential's signed assurance level
  matches what the RP recorded during negotiation, and MUST refuse activation on mismatch.

**Principle IV — Bounded Pending-Grant State**

- **FR-010**: The RP MUST persist a grant record with status `pending` at the moment the grant
  nonce is issued, containing at minimum the User public-key reference, agreed scope, agreed
  duration, and nonce.
- **FR-011**: The RP MUST transition a `pending` record to `active` only after successfully
  validating the second ceremony's signed credential against that same record.
- **FR-012**: The grant nonce MUST carry a validity window that is both short and strictly
  shorter than the credential's own `validFrom`/`validUntil` window. *[NEEDS CLARIFICATION: see
  OQ-7 — no default duration is specified in either source document.]*
- **FR-013**: If the second ceremony does not complete within the nonce's validity window, the
  RP MUST expire the pending record and MUST refuse to redeem that nonce afterward.

**Principle V — Single-Use Artifact Consumption Ordering**

- **FR-014**: The RP MUST mark every single-use artifact (grant nonce, transaction challenge,
  revocation challenge) as consumed at the moment it is retrieved for verification, before
  evaluating any other check (signature, scope, account lookup).
- **FR-015**: The RP MUST reject any subsequent presentation of an already-consumed artifact,
  regardless of whether the presentation that consumed it succeeded or failed downstream.

**Principle VI — Dual-Layer Replay Protection, Not Conflated**

- **FR-016**: The POC MUST implement grant-time nonce protection (issuance-replay prevention)
  and transaction-time challenge-response (session freshness) as two separately verifiable
  mechanisms, each independently testable.
- **FR-017**: The transaction-time challenge-response MUST use the Agent's own keypair via a
  plain challenge-response, and MUST NOT be implemented as, or documented as equivalent to, a
  WebAuthn/passkey ceremony — no human presence is asserted at this step.

**Principle VII — Agent-Held Keys, Never Custodied**

- **FR-018**: The Agent MUST generate its transacting keypair locally; the private key MUST NOT
  be transmitted to, or observable by, the User or the RP at any point in any flow.
- **FR-019**: By default, the POC MUST scope one Agent keypair per RP. *[NEEDS CLARIFICATION:
  see OQ-5 — the mechanics/trigger for the opt-in per-credential-key variant are undefined.]*

**Principle VIII — Lightweight, RP-Local, Synchronous Revocation**

- **FR-020**: Each credential MUST be scoped to exactly one User identity, one Agent identity,
  one RP, and one time window, with no cross-RP reuse.
- **FR-021**: The POC MUST NOT implement or depend on a global VC status-list or registry
  service for revocation.
- **FR-022**: The revocation endpoint MUST authenticate the caller via the User's passkey-bound
  identity, using a challenge cryptographically bound to the specific credential being revoked.
- **FR-023**: The RP MUST check revocation/active status synchronously, in the same request
  path, on every transaction attempt, with no asynchronous propagation delay.
- **FR-024**: On revocation, the RP MUST immediately halt future use of the credential and MUST
  attempt rollback of any in-flight transaction; the RP MUST signal the halt outcome to the
  Agent regardless of whether rollback succeeds.

**Principle IX — Provenance Over Correctness; Humans-in-the-Loop for Exceptions Only**

- **FR-025**: The POC MUST NOT include any mechanism that evaluates or asserts whether an
  in-scope agent action matches the User's specific task intent — such evaluation is explicitly
  out of scope.
- **FR-026**: The RP MUST distinguish "exception" conditions (out-of-scope request, expired
  window, anomaly) from routine in-scope transaction handling, and MUST NOT require human
  involvement for routine in-scope transactions. *[NEEDS CLARIFICATION: see OQ-6 — whether the
  exact set of exception conditions is standardized or left to RP discretion is open.]*

**Cross-Cutting — Credential Structure and Amendment**

- **FR-027**: The credential MUST contain, at minimum, an identity block (User public key, Agent
  public key, RP identifier), a scope block, a temporal block (`validFrom`/`validUntil`), and an
  integrity block (grant nonce, User signature, assurance level).
- **FR-028**: The RP MUST be able to deterministically evaluate any transaction request as
  in-scope or out-of-scope against the credential's scope block, with no ambiguous cases.
  *[NEEDS CLARIFICATION: see OQ-3 — the exact scope-block expressiveness is not defined.]*
- **FR-029**: The mechanism for computing the credential digest used as the WebAuthn challenge
  in ceremony two MUST be deterministic given the same credential content. *[NEEDS
  CLARIFICATION: see OQ-8 — no canonicalization/serialization format is specified by either
  source document.]*
- **FR-030**: Amending an active grant's scope or duration MUST be implemented as
  revoke-then-re-grant; the POC MUST NOT implement in-place mutation of an active grant record's
  terms.

### Key Entities

- **User**: the human Issuer. Represented to the RP by a passkey public key already on file from
  a prior registration (precondition — enrollment itself is out of scope). Authenticates in
  ceremony one and signs the credential in ceremony two.
- **Agent**: the software Holder acting on the User's behalf. Holds its own locally-generated
  keypair (never custodied by User or RP); identified in the credential by its public key.
- **RP (Relying Party)**: the single Verifier for this POC. Known to the User via an existing
  passkey relationship; negotiates scope/duration, persists grant records, validates
  credentials, and enforces revocation.
- **Credential**: the temporal Verifiable Credential issued by the User to the Agent's public
  key. Contains an identity block, a scope block, a temporal block, and an integrity block (see
  FR-027). RP-local; not designed for multi-verifier or long-lived reuse.
- **Pending Grant Record**: the RP's server-side state for a not-yet-signed grant, keyed by the
  grant nonce. Transitions `pending` → `active` (on successful second-ceremony validation) or
  `pending` → expired (on nonce-window timeout, no explicit terminal status required). An
  `active` record may later transition to `revoked`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A User can complete a full grant (both ceremonies) to authorize one Agent for one
  RP, scope, and duration, with no more than one network round-trip to the RP required to
  establish a fresh, verifiable challenge across the entire grant flow.
- **SC-002**: 100% of credential presentations carrying a mismatched, expired, or
  already-consumed grant nonce are rejected by the RP, with no grant record activated as a
  result.
- **SC-003**: Across a representative set of scope-boundary test cases, 100% of transaction
  attempts outside agreed scope are denied and 100% of transaction attempts inside agreed scope
  and window succeed — with zero cases producing an ambiguous (neither clearly in nor
  out-of-scope) outcome.
- **SC-004**: A revoked grant halts all subsequent transaction attempts starting with the very
  next request after revocation — zero transactions succeed after revocation completes.
- **SC-005**: Every attempted replay of an already-used nonce, transaction challenge, or
  revocation challenge is rejected, including replays that follow a failed downstream check, not
  only replays that follow a success.
- **SC-006**: No exposed capability of the POC allows an active grant's scope or duration to be
  changed in place; the only observable path to a new scope/duration is revoke-then-re-grant.
- **SC-007**: For every activated grant, an independent observer can verify — from the
  credential and the RP's negotiation record alone, without trusting the RP's internal log —
  that the granted scope was consistent with the assurance level achieved at grant time.
- **SC-008**: An Agent private key is never observed on the wire, or in RP-side or User-side
  storage, at any point across the grant, transaction, or revocation flows.

## Assumptions

- The POC targets a single RP instance; multi-RP or multi-agent identity federation is out of
  scope (per constitution non-goals).
- The Agent is software, not a human, and acts only after a grant is already complete; initial
  Agent onboarding/enrollment is out of scope.
- Every scenario assumes the User already has an established passkey relationship with the RP
  before the scenario begins — first-time passkey enrollment is a precondition, not a flow this
  POC implements.
- Where the RP's own downstream API access would conventionally use an internal OAuth token
  (per TAC_Proposal_Draft.md §11), that detail is internal to the RP, not exposed to the Agent,
  and is not part of what this POC needs to verify.
- Amendment of an active grant is out of scope beyond revoke-then-re-grant (per constitution
  non-goal); this is treated as settled, not as one of the open questions above.
