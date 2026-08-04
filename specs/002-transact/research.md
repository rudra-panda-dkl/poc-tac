# Phase 0 Research: TAC Transaction Flow (002-transact)

## 1. Where does the RP get the Agent's public key at transaction time?

**Problem**: FR-007 requires validating the challenge-response signature "against the Agent
public key recorded in the activated Credential." But 001-grant's actual implementation
(`CredentialValidationService.activate()`, `packages/rp-server/src/services/credential-validation-service.ts`)
never persists `credential.identity.agentPublicKey` anywhere — it validates the presented
`Credential` and discards it once `GrantRecordStore.transitionToActive()` runs.
`packages/shared/src/grant-record.ts`'s `GrantRecord` type has no field for it either. 001-grant's
own `data-model.md` calls `Credential` "the handoff contract for 002-transact," which only makes
sense if something about it survives past activation — but as implemented, nothing does.

**Decision**: Add a small `AgentKeyStore` (`packages/rp-server/src/models/agent-key-store.ts`),
keyed by grant nonce, storing just `{ agentPublicKey: JsonWebKey }`. Wire it into
`CredentialValidationService.activate()`'s success path (immediately after
`grantStore.transitionToActive(record.nonce)`) so recording the key is inseparable from the
transition it depends on. This is an additive change to 001-grant's `rp-server` package (new
store, one new call site in an existing service) — it does not redefine the `Credential` or
`GrantRecord` type shapes (002-transact's own Key Entities section is explicit that it "does not
add fields to this entity" for either), and it does not touch either entity's field-level
contract in `data-model.md`. It is the minimal change that makes 001-grant's own "handoff
contract" claim actually true.

**Rationale**: The alternative — persisting `agentPublicKey` as a new field directly on
`GrantRecord` — would violate 002-transact's own Key Entities constraint against adding fields to
that entity, and would also blur 001-grant's `GrantRecord` (a negotiation/activation record) with
transaction-time concerns. A separate, purpose-built store keeps the boundary clean: `GrantRecord`
stays exactly what 001-grant defined it as; `AgentKeyStore` is 002-transact's own small addition,
scoped to the one field it actually needs.

**Alternatives considered**:
- *Re-derive the Agent public key from the original `Credential` on every transaction* — rejected:
  the `Credential` itself is never persisted (by design — it's ephemeral, presented once at
  `/grant/activate`), so there is nothing to re-derive from without persisting something.
- *Store the full `Credential` on activation* — rejected: 002-transact only needs
  `identity.agentPublicKey`; persisting the whole object (including the User's WebAuthn assertion
  bytes) is unused surface area with no corresponding requirement.

## 2. Challenge-response signing mechanism (FR-006/FR-007)

**Decision**: Raw WebCrypto ECDSA (P-256, SHA-256) sign/verify over the JCS-canonicalized payload
`{ challenge, txType, amount }`, using the Agent's existing per-RP keypair
(`agent-client`'s `getOrCreateAgentKeypair`, already generated in 001-grant with `["sign"]`
usage). `crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, bytes)` hashes
internally, so — unlike 001-grant's WebAuthn-challenge digest, which needed a pre-computed SHA-256
buffer because `navigator.credentials.get()` takes a raw challenge — no separate manual hashing
step is needed here; the canonicalized JSON bytes are signed directly.

**Rationale**: FR-006 explicitly forbids this being a WebAuthn ceremony (no human present at
transaction time). Reusing the Agent's already-generated non-extractable keypair means no new key
material or custody surface is introduced (Constitution Principle VII, carried forward
unchanged). Reusing the same `canonicalize` (JCS) dependency 001-grant already established for
`packages/shared` keeps one canonicalization implementation shared by both the signing side
(`agent-client`) and verifying side (`rp-server`), exactly as 001-grant did for the credential
digest — avoiding a second, independently-drifting canonical-serialization implementation.

**Alternatives considered**:
- *DPoP-style proactive proof (Agent pre-generates a proof without an RP-issued challenge)* —
  rejected per spec.md Assumptions and FR-005; not reconsidered here.
- *HMAC over a shared secret* — rejected: would require the RP and Agent to share a symmetric
  secret, contradicting the Agent-held-asymmetric-keypair model Principle VII already established
  and reusing here.

## 3. Transaction Challenge storage (FR-010)

**Decision**: A new `TransactionChallengeStore` (`packages/rp-server/src/models/transaction-challenge-store.ts`),
independent from `GrantRecordStore`, in-memory, keyed by a freshly-generated challenge ID. Each
entry binds the challenge to the grant nonce it was issued against and the exact `{ txType,
amount }` it was issued for, plus `issuedAt`/`expiresAt`/`consumedAt`. Its
`retrieveForVerification()` method mirrors `GrantRecordStore.retrieveForVerification()`'s
atomic consume-at-retrieval pattern exactly (set `consumedAt` the instant the record is read,
before any other check — FR-008).

**Rationale**: FR-010 requires this layer be "distinct and independently verifiable" from
001-grant's grant-nonce layer and "MUST NOT share storage or consumption logic" with it — a
literal, separate `Map` and class satisfies this unambiguously. Copying
`GrantRecordStore.retrieveForVerification()`'s exact shape is deliberate: that method's
consume-then-check ordering is the mechanism Constitution Principle V (NON-NEGOTIABLE) requires,
and 001-grant's own `quickstart.md` records that this exact bug (consuming on success only,
instead of on retrieval) was caught and fixed there — reusing the proven-correct shape here
avoids reintroducing that same bug in a second implementation.

**Alternatives considered**:
- *Store transaction challenges as entries inside `GrantRecordStore`, namespaced by a different
  key prefix* — rejected: FR-010 explicitly forbids shared storage; a shared `Map` with
  key-prefix discipline is exactly the kind of accidental coupling that requirement rules out.

## 4. Two-endpoint request/respond shape vs. a single combined call

**Decision**: Two HTTP endpoints — `POST /transact/request` (Grant-state gate, issues challenge)
and `POST /transact/respond` (challenge consumption, signature verification, permit decision) —
mirroring 001-grant's `/grant/negotiate` + `/grant/activate` two-step precedent.

**Rationale**: The Agent cannot sign a challenge it doesn't have yet, so a genuine round-trip is
structurally required (this isn't a stylistic choice the way it was debatable in 001-grant — here
FR-005 issuing a fresh, RP-generated challenge and FR-006 the Agent signing *that* challenge are
sequential by construction). Splitting Grant-state checks (FR-002/003/004) into the first call
also directly satisfies SC-001 ("100% of transaction attempts against a non-active Grant Record
are denied, with no challenge issued") — a single combined endpoint would make "no challenge
issued" on denial harder to express cleanly.

**Alternatives considered**:
- *Single endpoint accepting a client-generated challenge alongside the signed response* —
  rejected: this is exactly the DPoP-style proactive-proof shape FR-005/Assumptions rule out.

## 5. Re-checking Grant state at the second call

**Decision**: `/transact/respond`'s permit decision re-runs the same active/in-window check used
by `/transact/request`'s gate (scope is not re-checked here — it cannot change between the two
calls, since the challenge is already bound to the specific `{ txType, amount }` that passed the
scope check at issuance), immediately after the challenge is successfully consumed and the
signature verified.

**Rationale**: FR-011 requires the Grant to be active and in-window as part of the same permit
decision that also requires signature validity and challenge freshness — not merely at some
earlier point in time. Because the transaction challenge's own validity window is short-lived by
design (Assumptions) but is a separate window from the Grant's own `validFrom`/`validUntil`
(FR-010's "distinct" requirement extends to this too), a Grant could in principle cross its own
`validUntil` in the (short) gap between request and respond. Re-running the same check function
both places costs one extra call to logic that already exists; it does not introduce new state or
storage.

**Alternatives considered**:
- *Check Grant state only once, at `/transact/request`* — rejected: doesn't literally satisfy
  FR-011's phrasing that every condition is required at the point of permit decision, and leaves a
  window (however short) where an already-expired Grant could still be permitted.

## 6. Testing framework, canonicalization library, Agent key algorithm

**Decision**: Unchanged from 001-grant — Vitest, `canonicalize` (RFC 8785 JCS), ECDSA P-256. Not
re-litigated here; see `specs/001-grant/research.md` §§2, 4, 5 for the original rationale, which
applies identically to this feature (same monorepo, same shared dependency versions, same Agent
keypair already generated in 001-grant and reused as-is, not regenerated).
