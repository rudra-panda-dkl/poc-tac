# Feature Specification: TAC Grant Revocation Flow (Feature 3 of 3)

**Feature Branch**: `003-revoke`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Revocation flow for the TAC POC — lightweight, RP-local, synchronous revocation per constitution Principle VIII: the User authenticates via their passkey-bound identity to an RP-local endpoint, presenting a single-use revocation challenge cryptographically bound to the specific Grant being revoked, and the RP flips that Grant Record's status to `revoked`. Every subsequent transaction attempt (002-transact) against a revoked Grant must be denied with no propagation delay, achieved by relying on 002-transact's existing active-only Grant-state gate rather than building a new check. Third and final feature; references 001-grant's Grant Record/Credential and 002-transact's transaction-time gate."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - User Revokes an Active Grant and Future Transactions Are Immediately Denied (Priority: P1)

A User who granted an Agent temporal access decides to revoke it. They authenticate via their
passkey to the RP's revocation endpoint, referencing the specific Grant. The RP validates the
request, transitions the Grant Record to `revoked`, and confirms. From that instant, any
transaction attempt the Agent makes against that Grant — whether starting fresh or already
mid-flight — is denied by 002-transact's existing Grant-state gate, with no propagation delay.

**Why this priority**: this is the entire reason revocation exists — a User who cannot reliably
and immediately cut off an Agent's access has no real control over a temporal grant; Constitution
Principle VIII treats this synchronicity as a core guarantee, not an enhancement.

**Independent Test**: seed an `active` Grant Record (as 001-grant would produce), revoke it via a
properly-authenticated request, and confirm both (a) the RP returns a revoked acknowledgment and
the Grant Record's status is `revoked`, and (b) an immediately-following transaction request
against that Grant (via 002-transact) is denied.

**Acceptance Scenarios**:

1. **Given** an `active` Grant Record, **When** the User authenticates and requests its
   revocation, **Then** the RP transitions the Grant Record to `revoked` and returns an explicit
   revoked acknowledgment.
2. **Given** a Grant Record that was just revoked, **When** the Agent requests a transaction
   against it, **Then** the RP denies the request exactly as it would for any non-`active` Grant.
3. **Given** a Grant Record whose transaction challenge was issued before revocation completed,
   **When** the Agent presents its signed response after revocation completed, **Then** the RP
   denies the transaction.

---

### User Story 2 - RP Denies Revocation Attempts That Aren't Properly Authenticated or Scoped (Priority: P1)

Any single failed check — an invalid signature, a revocation challenge scoped to a different
Grant, or a target Grant that isn't currently `active` — causes the RP to deny the revocation
attempt, with the Grant Record's status left unchanged.

**Why this priority**: a revocation mechanism that can be triggered by the wrong party, or that
can be tricked into revoking the wrong credential, is worse than no revocation mechanism at all —
this must hold as reliably as the happy path.

**Independent Test**: seed Grant Records in each denial-worthy state in turn (`pending`,
`expired`, already-`revoked`) and confirm every revocation attempt against them is denied;
separately, seed two distinct active Grant Records for the same User and confirm a revocation
challenge issued for one cannot revoke the other, and confirm an invalid signature is denied.

**Acceptance Scenarios**:

1. **Given** a Grant Record with status `pending`, `expired`, or `revoked`, **When** the User
   requests its revocation, **Then** the RP denies the request without transitioning the record.
2. **Given** a revocation challenge issued for Grant Record A, **When** it is signed and
   presented against Grant Record B (a different, active Grant held by the same User at the same
   RP), **Then** the RP denies the request and neither record's status changes.
3. **Given** a fresh revocation challenge has been issued, **When** the presented signature does
   not validate against the target Grant's registered passkey, **Then** the RP denies the
   request.

---

### User Story 3 - Revocation Challenge Is Provably Single-Use (Priority: P1)

The revocation challenge, once retrieved for verification, cannot be redeemed a second time —
whether the first presentation succeeded or failed a later check — and this replay protection is
distinct from, and independently verifiable of, both 001-grant's grant-time nonce layer and
002-transact's transaction-time challenge layer.

**Why this priority**: this validates Constitution Principle V (NON-NEGOTIABLE consumption
ordering) for the third and final artifact type it names; if a captured revocation assertion
could be replayed, a User's own revocation request could itself become a vector for repeated
unauthorized state changes.

**Independent Test**: issue a revocation challenge, redeem it once (successfully or with a
failing downstream check), then attempt to redeem the same challenge a second time and confirm it
is always rejected — including when the corresponding Grant Record's own grant-nonce (001-grant)
and any of its transaction challenges (002-transact) are untouched by this replay.

**Acceptance Scenarios**:

1. **Given** a revocation challenge that has already been successfully redeemed, **When** a
   second request presents the same challenge, **Then** the RP rejects it.
2. **Given** a revocation challenge presented with an invalid signature on first attempt, **When**
   the same challenge is presented again with a corrected, validly-signed response, **Then** the
   RP still rejects it, because the challenge was marked consumed at retrieval, not at successful
   verification.

---

### Edge Cases

- What happens if the Agent (not the User) attempts to call the revocation endpoint? Denied — an
  Agent has no registered passkey, so it cannot produce a valid WebAuthn assertion; this is not a
  distinct denial path, just an ordinary invalid-signature rejection (User Story 2, Scenario 3).
- What happens if a revocation request and a transaction request/response race concurrently
  against the same Grant? Whichever completes first at the Grant Record store determines the
  outcome for the other — this feature does not add new serialization beyond what already
  exists, consistent with 002-transact's own stance on concurrent transaction attempts.
- What happens if the User attempts to revoke a Grant Record that was never issued (unknown/bogus
  reference)? Denied — not distinguished from any other non-active-Grant denial (User Story 2,
  Scenario 1).
- What happens to a transaction whose challenge was issued before revocation but whose response
  arrives after? Denied by 002-transact's existing respond-time Grant-state re-check (FR-012) —
  not a special case this feature needs to handle separately (User Story 1, Scenario 3).
- What happens after a Grant is revoked — is the Agent notified, or does it just fail its next
  attempt? The latter; see Assumptions.

## Requirements *(mandatory)*

### Functional Requirements

**Revocation Request — Grant Reference & State Gate**

- **FR-001**: The User MUST present a reference to the specific `active` Grant they intend to
  revoke (sufficient for the RP to look up the corresponding Grant Record) when requesting
  revocation.
- **FR-002**: The RP MUST refuse a revocation request unless the referenced Grant Record's status
  is `active` — a `pending`, `expired`, or already-`revoked` Grant is refused, with no
  requirement to distinguish which reason among them (mirrors 001-grant's and 002-transact's own
  "not active" denial pattern).
- **FR-003**: On passing the state check, the RP MUST issue a fresh, single-use revocation
  challenge bound to that specific Grant Record, for the User to sign.

**Revocation Authentication — Passkey-Bound, Credential-Scoped (Constitution Principle VIII)**

- **FR-004**: The RP MUST authenticate the revocation request via a standard WebAuthn assertion
  ceremony — server-issued challenge (the revocation challenge from FR-003), signed by the User's
  already-registered passkey — the same authentication mechanism 001-grant's ceremony one already
  establishes. This feature MUST NOT invent a second, locally-signed ceremony the way 001-grant's
  ceremony two does; revocation has no scope or duration to negotiate or embed, so one ceremony
  suffices (Constitution Principle II's two-ceremony structure is scoped to grant issuance only).
- **FR-005**: The RP MUST validate the WebAuthn assertion's signature against the passkey
  registered to the account associated with the target Grant Record before permitting revocation.
- **FR-006**: A revocation challenge issued for one Grant Record MUST NOT be usable to revoke a
  different Grant Record, even one held by the same User at the same RP — the RP MUST verify the
  presented challenge's recorded target Grant matches the Grant Record being revoked, using only
  the RP's own stored binding, never a value resent by the caller.

**Single-Use Revocation Challenge Consumption Ordering (Constitution Principle V, NON-NEGOTIABLE)**

- **FR-007**: The RP MUST mark the revocation challenge as consumed at the moment it is retrieved
  for verification, before evaluating any other check (signature validity, Grant state,
  target-match).
- **FR-008**: The RP MUST reject any subsequent presentation of an already-consumed revocation
  challenge, regardless of whether the presentation that consumed it succeeded or failed
  downstream.
- **FR-009**: This revocation-challenge replay-protection layer MUST be implemented as a
  mechanism distinct and independently verifiable from BOTH 001-grant's grant-nonce layer AND
  002-transact's transaction-challenge layer (Constitution Principle V) — it MUST NOT share
  storage or consumption logic with either.

**Revocation Effect — Grant State Transition**

- **FR-010**: On a successful revocation, the RP MUST transition the Grant Record's status to a
  new `revoked` value, reachable only from `active` — this feature extends the Grant Record's set
  of possible status values (unlike 002-transact, which explicitly added none).
- **FR-011**: On successful revocation, the RP MUST send an explicit revoked acknowledgment to the
  User, distinct from silently succeeding.

**Synchronous Effect on Transaction-Time Checks (Constitution Principle VIII)**

- **FR-012**: Once a Grant Record's status is `revoked`, every subsequent transaction attempt
  against it — including one already mid-flight between 002-transact's challenge issuance and
  challenge-response steps — MUST be refused, with no propagation delay. This feature MUST NOT
  introduce a new revocation-status check or new storage for this purpose: 002-transact's
  existing Grant-state gate, which already refuses any transaction request or response unless
  status is `active` (both at request time and again at respond time), MUST be the sole mechanism
  that delivers this guarantee, reading the same Grant Record store this feature writes to.

**Feature Boundary**

- **FR-013**: This feature MUST NOT guarantee rollback of a transaction already permitted before
  revocation took effect — revocation halts future transaction attempts only; the permit decision
  itself, once issued, is final for this POC's protocol surface (consistent with 002-transact's
  FR-013 boundary: no downstream business-transaction execution is modeled here to roll back).
- **FR-014**: This feature MUST NOT implement in-place amendment of an active Grant's scope or
  duration — a scope/window change is modeled as revoke-then-re-grant (Constitution Non-Goals),
  not a separate amendment operation.
- **FR-015**: This feature MUST NOT implement a bulk or multi-grant revocation operation — one
  revocation request targets exactly one Grant Record, consistent with the
  one-User-one-Agent-one-RP-one-window model (Constitution Non-Goals).

### Key Entities

- **Revocation Challenge**: an RP-issued, single-use artifact (Constitution Principle V) —
  issued per revocation attempt, consumed at retrieval, bound to the specific Grant Record it
  targets (FR-006), and serving as the WebAuthn assertion ceremony's own challenge value (FR-004).
  Distinct storage from both 001-grant's grant nonce and 002-transact's transaction challenge
  (FR-009). Ephemeral only, like 002-transact's Transaction Challenge — no durable
  revocation-history record beyond the Grant Record's own terminal status.
- **Grant Record** *(from 001-grant, read/checked here)*: this feature reads `status` and the
  account reference to gate and authenticate revocation, and is the one feature that adds a new
  value (`revoked`) to `status`'s set of possible values (FR-010) — 001-grant's own data model
  already reserved this as a status reachable from `active`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of properly-authenticated revocation requests against an `active` Grant
  succeed and transition it to `revoked`.
- **SC-002**: 100% of transaction attempts — at request time or respond time — against a Grant
  revoked before that attempt are denied, with no measurable propagation delay.
- **SC-003**: 100% of revocation requests against a non-`active` Grant (`pending`, `expired`, or
  already-`revoked`) are denied.
- **SC-004**: 100% of revocation attempts with an invalid signature, or a challenge scoped to a
  different Grant, are denied.
- **SC-005**: 100% of revocation-challenge replay attempts are rejected, including replays
  following a failed downstream check on the first attempt.
- **SC-006**: Every successful revocation can be traced to one specific Grant Record transition
  and one specific, successfully-verified, single-use revocation challenge, distinct from any
  artifact checked during that Grant's issuance (001-grant) or any of its transactions
  (002-transact).

## Assumptions

- This feature presupposes an `active` Grant Record exists (from 001-grant) and that
  002-transact's transaction-time Grant-state gate is already implemented and already reads the
  same Grant Record store — revocation's synchronous, no-propagation-delay effect (Constitution
  Principle VIII, SC-002) is achieved entirely by relying on that existing gate, not by adding a
  new one (FR-012).
- The User revoking a Grant is assumed to be the same User identity that originally authorized it
  (the same registered passkey) — no delegated or administrative revocation by a different party
  is in scope.
- The User already knows or holds a reference to the Grant they wish to revoke (e.g., from when
  it was created) — a "list my active grants" discovery/query capability is out of scope for this
  feature.
- Out-of-band notification to the Agent that its access was revoked (push notification, webhook,
  etc.) is out of scope — the Agent simply finds its next transaction attempt denied.
- Consistent with 001-grant's own precedent, revocation authentication reuses standard WebAuthn
  ceremony mechanics rather than inventing a new signing flow, even though Constitution Principle
  II's two-ceremony structure itself is scoped to grant issuance only, not revocation.
