# Feature Specification: TAC Transaction Flow (Feature 2 of 3)

**Feature Branch**: `002-transact`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "Transaction-time challenge-response flow for the TAC POC — the session-freshness half of constitution Principle VI (RP issues a fresh challenge per transaction, Agent responds with its own private key, no human presence at transaction time), plus scope/window enforcement against the 001-grant Credential and Grant Record. Second of three features."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent Completes a Permitted Transaction (Priority: P1)

An Agent holding an active, signed Credential from 001-grant requests a transaction from the RP.
The RP checks the underlying Grant Record is active, in-scope, and in-window, issues a fresh
challenge, and the Agent proves live possession of its private key by signing that challenge —
with no human present for this step. On success, the RP permits the transaction.

**Why this priority**: this is the entire reason a grant exists — an Agent that can never
actually transact delivers no value; this is the feature's MVP.

**Independent Test**: seed an `active` Grant Record (as 001-grant would produce), request a
transaction within its scope and window, complete the challenge-response with the Agent's
private key, and confirm the RP returns a permit decision.

**Acceptance Scenarios**:

1. **Given** an `active` Grant Record whose window has not elapsed, **When** the Agent requests
   a transaction within the Grant's agreed scope, **Then** the RP issues a fresh, single-use
   challenge.
2. **Given** a fresh challenge has been issued, **When** the Agent signs it with the private key
   corresponding to the public key recorded in the activated Credential, **Then** the RP
   validates the signature and permits the transaction.
3. **Given** a successfully validated challenge-response, **When** the RP makes its permit
   decision, **Then** the Agent receives an explicit permitted acknowledgment (not a silent
   pass-through).

---

### User Story 2 - RP Denies a Transaction Outside What Was Granted (Priority: P1)

Any single failed check — Grant not active, transaction outside agreed scope, outside the
Grant's validity window, or an invalid/missing challenge-response — causes the RP to deny the
transaction, with no partial permission granted as a side effect.

**Why this priority**: a transaction gate that can be bypassed by any one failed check undermines
the entire point of assurance-bound, temporally-scoped grants; this must hold as reliably as the
happy path.

**Independent Test**: seed Grant Records in each denial-worthy state in turn (`pending`,
`expired`, `active`-but-out-of-scope, `active`-but-outside-window) and confirm every transaction
attempt against them is denied, plus confirm an `active`/in-scope/in-window attempt with a
corrupted or missing challenge-response is also denied.

**Acceptance Scenarios**:

1. **Given** a Grant Record with status `pending` or `expired`, **When** an Agent requests a
   transaction against it, **Then** the RP denies the request without issuing a challenge.
2. **Given** an `active`, in-window Grant Record, **When** the Agent requests a transaction
   outside the Grant's agreed scope, **Then** the RP denies the request.
3. **Given** an `active` Grant Record whose `validUntil` has passed, **When** the Agent requests
   a transaction, **Then** the RP denies the request as outside the window.
4. **Given** a fresh challenge has been issued, **When** the Agent's response signature does not
   validate against the Credential's recorded Agent public key, **Then** the RP denies the
   transaction.

---

### User Story 3 - Transaction Challenge Is Provably Single-Use (Priority: P1)

The transaction-time challenge, once retrieved for verification, cannot be redeemed a second
time — whether the first presentation succeeded or failed a later check — and this replay
protection is distinct from, and independently verifiable of, 001-grant's grant-time nonce layer.

**Why this priority**: this validates Constitution Principle V (NON-NEGOTIABLE consumption
ordering) and Principle VI's transaction-time half of dual-layer replay protection; if this
doesn't hold, the freshness guarantee this entire feature exists to provide is void.

**Independent Test**: issue a challenge, redeem it once (successfully or with a failing
downstream check), then attempt to redeem the same challenge a second time and confirm it is
always rejected — including when the corresponding Grant Record's own artifacts (from 001-grant)
are untouched by this replay.

**Acceptance Scenarios**:

1. **Given** a challenge that has already been successfully redeemed, **When** a second
   response presents the same challenge, **Then** the RP rejects it.
2. **Given** a challenge presented with an invalid signature on first attempt, **When** the same
   challenge is presented again with a corrected, validly-signed response, **Then** the RP still
   rejects it, because the challenge was marked consumed at retrieval, not at successful
   verification.

---

### Edge Cases

- What happens if the Agent requests a transaction referencing a Grant Record that was never
  issued (unknown/bogus grant reference)? The RP denies the request — this is not distinguished
  from any other "not active" rejection (User Story 2, Scenario 1).
- What happens if two transaction requests for the same `active` Grant arrive concurrently? Each
  gets its own independently-issued, independently-consumed challenge — this feature does not
  need to serialize concurrent transaction attempts against the same Grant, since single-use
  challenge consumption (User Story 3) is scoped per-challenge, not per-Grant.
- What happens if the Agent signs a challenge with a keypair other than the one recorded in its
  activated Credential (e.g., after local key rotation outside this protocol)? Signature
  validation fails (User Story 2, Scenario 4) — this feature has no mechanism to accept a
  different key than what 001-grant bound into the credential.
- What happens after the RP permits a transaction? Out of scope for this feature — see
  Assumptions.

## Requirements *(mandatory)*

### Functional Requirements

**Transaction Gate — Grant State Checks**

- **FR-001**: The Agent MUST present a reference to its active Grant (sufficient for the RP to
  look up the corresponding Grant Record) when requesting a transaction.
- **FR-002**: The RP MUST refuse a transaction request unless the referenced Grant Record's
  status is `active`.
- **FR-003**: The RP MUST refuse a transaction request unless the current time falls within the
  Grant Record's `validFrom`/`validUntil` window.
- **FR-004**: The RP MUST evaluate the requested transaction against the Grant Record's scope
  block and refuse the request if it is out-of-scope. "In-scope" MUST be evaluated as BOTH: (a)
  the requested transaction type is present in the scope block's allowed-types list, AND (b) the
  requested amount does not exceed the scope block's numeric ceiling — both conditions required,
  matching the `{txTypes, maxAmount}` shape 001-grant's own demo scripts already established as
  the scope block's example content.

**Session/Transaction-Time Freshness (Constitution Principle VI)**

- **FR-005**: The RP MUST issue a fresh, RP-generated challenge for each transaction attempt
  that passes the Grant state checks (FR-002/FR-003/FR-004) — this feature MUST NOT accept an
  Agent-proactively-generated proof (a DPoP-style proof generated without an RP-issued challenge)
  in place of an RP-issued challenge under any circumstance; no fallback or secondary path around
  the RP-issued challenge is permitted (see Assumptions).
- **FR-006**: The Agent MUST respond by signing the challenge with the private key corresponding
  to the Agent public key recorded in its activated Credential (the same per-RP keypair 001-grant
  generated) — this signing step MUST NOT be a WebAuthn ceremony; there is no human present at
  transaction time, by design, and this step MUST NOT be presented or implemented as if it
  carries human-presence semantics.
- **FR-007**: The RP MUST validate the Agent's challenge-response signature against the Agent
  public key recorded in the activated Credential before permitting a transaction. The signed
  payload MUST cover both the RP-issued challenge AND the transaction's own request parameters
  (at minimum, transaction type and amount) — binding the signature to that specific
  transaction's content, not merely proving key possession against an opaque challenge, so a
  request cannot be tampered with after signing without invalidating the signature.

**Single-Use Artifact Consumption Ordering (Constitution Principle V, NON-NEGOTIABLE — transaction-time layer)**

- **FR-008**: The RP MUST mark the transaction-time challenge as consumed at the moment it is
  retrieved for verification, before evaluating any other check (signature validity, Grant state).
- **FR-009**: The RP MUST reject any subsequent presentation of an already-consumed
  transaction-time challenge, regardless of whether the presentation that consumed it succeeded
  or failed downstream.
- **FR-010**: This transaction-time replay-protection layer MUST be implemented as a mechanism
  distinct and independently verifiable from 001-grant's grant-nonce layer (Constitution
  Principle VI) — it MUST NOT share storage or consumption logic with the Grant Record's nonce.

**Permit Decision**

- **FR-011**: The RP MUST NOT permit a transaction unless the Grant is active, in-scope, and
  in-window (FR-002/FR-003/FR-004) AND the challenge-response signature is valid AND the
  challenge was unconsumed at retrieval (FR-007/FR-008) — every condition is required; no single
  passing check may permit a transaction on its own.
- **FR-012**: On a successful permit decision, the RP MUST send an explicit permitted
  acknowledgment to the Agent, distinct from silently proceeding to any downstream action.

**Feature Boundary**

- **FR-013**: This feature MUST NOT perform, simulate, or model the RP's actual downstream
  business-transaction execution (e.g., ledger updates, external side effects) — the permit
  decision is this feature's endpoint (Constitution Principle IX: TAC proves provenance, not
  business-outcome correctness).
- **FR-014**: This feature MUST NOT implement a revocation mechanism — checking that a Grant
  Record's status is `active` (FR-002) is as far as this feature goes; the mechanism that
  transitions a Grant to a `revoked` status is 003-revoke's concern (Constitution Principle VIII).
- **FR-015**: This feature MUST NOT implement a human-in-the-loop notification or exception-review
  mechanism — an RP-side denial (User Story 2) fully satisfies this feature's requirements for
  out-of-scope, out-of-window, or invalid attempts (Constitution Principle IX; consistent with
  001-grant's own stance that exception handling is a later feature's concern).

### Key Entities

- **Transaction Challenge**: an RP-issued, single-use artifact analogous in mechanism to
  001-grant's grant nonce but distinct in purpose and storage (FR-010) — issued per transaction
  attempt, consumed at retrieval, and bound to the Grant Record it was issued against, plus the
  transaction request parameters it was issued for (FR-007). Ephemeral only: this feature does
  NOT persist a durable transaction-history record — validation is stateless beyond this
  short-lived challenge and the existing Grant Record from 001-grant. A permitted transaction is
  traceable (SC-006) via the permit acknowledgment itself, not a queryable log.
- **Grant Record** *(from 001-grant, read/checked here, not redefined)*: this feature reads
  `status`, `agreedScope`, and `agreedDuration` to make its permit/deny decision; it does not add
  fields to this entity.
- **Credential** *(from 001-grant, read/checked here, not redefined)*: this feature reads
  `identity.agentPublicKey` to validate the challenge-response signature; it does not add fields
  to this entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of transaction attempts against a non-`active` (pending or expired) Grant
  Record are denied, with no challenge issued.
- **SC-002**: 100% of transaction attempts that are in-scope, in-window, and correctly signed are
  permitted.
- **SC-003**: 100% of out-of-scope transaction attempts are denied, regardless of an otherwise
  valid signature.
- **SC-004**: 100% of out-of-window transaction attempts are denied, regardless of an otherwise
  valid signature.
- **SC-005**: 100% of transaction-time challenge replay attempts are rejected, including replays
  following a failed downstream check on the first attempt.
- **SC-006**: Every permitted transaction can be traced to one specific `active` Grant Record and
  one specific, successfully-verified, single-use challenge distinct from any artifact checked
  during that Grant's original issuance (001-grant).

## Assumptions

- This feature presupposes an `active` Grant Record and its Credential already exist, produced by
  001-grant — first-time grant issuance is out of scope here.
- "Execute transaction" (the RP's actual business action after a permit decision) is outside this
  feature's protocol surface — this feature's responsibility ends at the permit/deny decision,
  consistent with Constitution Principle IX's provenance-not-correctness boundary.
- The RP's optional internal minting of its own OAuth access token for its own downstream API
  access (noted in TAC_Proposal_Draft.md's sequence diagram as an architecture-dependent,
  optional step) is out of scope — it is never exposed to the Agent and has no bearing on the
  Agent-facing protocol this feature specifies.
- The transaction-time challenge's validity window is short-lived by design (freshness, not a
  negotiated term) — a POC-reasonable default is assumed and is implementation-level
  configuration, not a further open spec question, mirroring how 001-grant treated its own nonce
  window's concrete default as implementation policy once the mechanism itself was settled.
- The DPoP-style "proactive proof" simplification (Agent generates a proof without an RP-issued
  challenge) considered in TAC_vs_DPoP_Writeup.md is explicitly NOT adopted here, since it
  inherits known pre-generation/replay exposure unless a server-nonce mode is separately built —
  not pursued for this POC.
