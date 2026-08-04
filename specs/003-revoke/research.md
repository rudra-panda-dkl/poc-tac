# Phase 0 Research: TAC Grant Revocation Flow (003-revoke)

## 1. Revocation authentication mechanism: reuse ceremony one, not a new ceremony

**Decision**: Authenticate the revocation request via a single standard WebAuthn assertion
ceremony, reusing `packages/rp-server/src/services/webauthn.ts`'s existing
`buildAuthenticationOptions()` / `verifyAssertion()` helpers unchanged — the exact mechanism
001-grant's ceremony one already uses. No second, locally-signed ceremony (`ceremony-two`'s
digest-as-challenge trick) is needed.

**Rationale**: FR-004 requires this explicitly. Ceremony two's local-signing step exists in
001-grant because a *scope/duration-bearing document* needs the User's signature over its exact
content (FR-021's JCS digest). Revocation has no scope or duration to negotiate or embed — it is
a single yes/no action against an already-existing Grant Record — so there is nothing for a
second ceremony to add. Constitution Principle II's two-ceremony structure is explicitly scoped
to "every grant," i.e., grant issuance; it does not extend to revocation, and spec.md's FR-004
already resolves this rather than leaving it as an open question.

**Alternatives considered**:
- *A second, locally-signed ceremony mirroring 001-grant's ceremony two* — rejected: there is no
  document content to bind a digest to beyond "revoke grant X," which the single ceremony's
  challenge-binding (research.md §2) already covers.

## 2. Revocation-challenge-to-Grant binding

**Decision**: `POST /revoke/request` takes a `grantNonce`. The RP looks up the Grant Record,
runs the state gate (FR-002), and — on pass — calls `buildAuthenticationOptions()` scoped to the
Grant owner's specific registered credential (`allowedCredentialId`, already a parameter that
function accepts, resolved via `RegisteredPasskeyStore.getByAccountId(record.userPublicKeyRef)`).
The returned WebAuthn `challenge` is recorded in a new `RevocationChallengeStore`, keyed by a
fresh `challengeId`, alongside the `grantNonce` it targets. The caller never supplies `grantNonce`
again at respond time — only `challengeId` + the signed `assertionResponse` — so the RP always
verifies against **its own stored binding**, never anything the caller asserts.

**Rationale**: FR-006 requires that a captured revocation assertion "MUST NOT be usable to revoke
a different Grant Record... using only the RP's own stored binding, never a value resent by the
caller." Structuring the request/respond split this way — mirroring 002-transact's proven
`{challengeId, signature}` respond-shape (research.md §1 there) — makes cross-credential replay
structurally impossible rather than a check that could be forgotten: `/revoke/respond` has no
field for the caller to specify *which* Grant it's revoking, so there is nothing to trick it with.
Scoping `buildAuthenticationOptions()` to the specific `allowedCredentialId` is a second,
belt-and-suspenders layer — even if an attacker's own passkey produced a validly-signed assertion,
it would be for the wrong `credentialID` and fail `verifyAssertion()`'s registered-authenticator
check.

**Alternatives considered**:
- *Derive the challenge value cryptographically from the grantNonce itself (e.g.,
  `SHA-256(grantNonce)`), instead of storing an explicit binding* — rejected: adds a digest
  computation for no benefit over an explicit stored `{challengeId → grantNonce}` mapping, and
  breaks from the plain-random-token pattern 002-transact's `TransactionChallengeStore` already
  established and proved correct.

## 3. New single-use store, not reuse of an existing one

**Decision**: A new `RevocationChallengeStore` (`packages/rp-server/src/models/revocation-challenge-store.ts`),
in-memory, keyed by `challengeId`, with an atomic `retrieveForVerification()` method copying
`TransactionChallengeStore`'s (and, before it, `GrantRecordStore`'s) exact consume-at-retrieval
shape.

**Rationale**: Constitution Principle V lists "grant-time nonce, transaction-time challenge,
revocation challenge" as three sibling single-use artifact types and requires each be marked
consumed at retrieval, before any other check. FR-009 additionally requires this layer be
"distinct and independently verifiable" from both existing layers, sharing no storage or
consumption logic with either. `PendingChallengeStore` (ceremony one's own server-challenge
staging) was considered and rejected as a base: it is keyed by `accountId`, not per-Grant, and its
`take()`-deletes-on-read semantics don't track *why* a second retrieval fails the way
`retrieveForVerification()`'s explicit `consumedAt` field does — reusing it would blur exactly the
layer boundary FR-009 exists to keep sharp, and would still need a grant-binding side-table bolted
on regardless.

**Alternatives considered**:
- *Reuse `PendingChallengeStore`* — rejected, per above.
- *Namespace revocation challenges into `TransactionChallengeStore` with a type discriminator* —
  rejected: exactly the kind of accidental coupling FR-009 (mirroring 002-transact's FR-010)
  forbids.

## 4. Grant Record status extension

**Decision**: Add `"revoked"` to `packages/shared/src/grant-record.ts`'s `GrantRecordStatus`
union (currently `"pending" | "active" | "expired"`), and add
`GrantRecordStore.transitionToRevoked(nonce)`, mirroring the existing
`transitionToActive`/`transitionToExpired` methods' exact shape (mutate `record.status` in place
on the object already held in the store's `Map`).

**Rationale**: 001-grant's own `grant-record.ts` docblock already reserves this: "Handoff
contract for 002-transact... and 003-revoke (adds a `revoked` status reachable from `active`)."
This is the one place this feature extends 001-grant's data — unlike 002-transact, which
deliberately added no `GrantRecord` fields (its own spec.md Key Entities said so explicitly).
003-revoke's spec.md is equally explicit that it *does* add this one status value (FR-010),
avoiding the ambiguity a silent, undocumented type change would otherwise create.

**Alternatives considered**:
- *Model revocation as a separate boolean flag or a separate "revoked grants" set, leaving
  `status` untouched* — rejected: 002-transact's `TransactionService.evaluateActiveAndWindow()`
  already checks `record.status !== "active"` as its sole active-ness test (verified directly by
  reading that code in this conversation before planning began); a separate flag would require
  also modifying that check, which is precisely what FR-012 (research.md §5) forbids doing.
  Extending the status enum is what makes "no code change to 002-transact" literally true instead
  of merely intended.

## 5. Synchronous effect on 002-transact's transaction gate: verified, not assumed

**Decision**: Build no new revocation-status check into `TransactionService`. Rely entirely on
`TransactionService.evaluateActiveAndWindow()`'s existing `record.status !== "active"` test
(`transaction-service.ts:179`), fed by `GrantRecordStore.get()` (`grant-record-store.ts:42-44`) —
already confirmed, by reading both files directly before this plan was written, to be a live,
uncached `Map.get()` against the same store instance `transitionToRevoked()` will mutate in
place. `respond()` already re-runs this same check (`transaction-service.ts:116`) using only
`challenge.grantNonce` from its own stored challenge record — never a value resupplied by the
caller — so a transaction whose challenge was issued *before* revocation but whose response
arrives *after* is caught by this existing re-check with zero new code.

**Rationale**: FR-012 explicitly forbids introducing new storage or a new check for this purpose.
This was verified empirically (reading the actual current source, not inferred from the spec)
before this plan was written — see the conversation record for the line-by-line confirmation.
Constitution Principle VIII's "no propagation delay" requirement is satisfied by construction:
there is no cache, no message queue, no polling interval between `transitionToRevoked()`'s write
and the next `.get()` read — they are the same in-memory `Map`, in the same process.

**Dependency, not an independent guarantee**: this "same process, same `Map`" property is not
something 003-revoke establishes — it is inherited entirely from 001-grant's own Scale/Scope
assumption of a single RP instance with an in-memory, process-local store (`GrantRecordStore`,
`research.md` §6 there), which 002-transact already depended on unchanged for its own respond-time
re-check. 003-revoke adds nothing new to this dependency, but also cannot discharge it: if a
future feature ever moved `GrantRecordStore` to multiple RP instances or an external store with
its own replication/caching behavior, FR-012's "no propagation delay" claim — and the identical
claim 002-transact's own respond-time re-check already implicitly makes — would both need
re-verifying from scratch, not just this feature's slice of it. This plan's Constitution Check
(Principle VIII row) should be read as scoped to the single-RP-instance assumption currently in
force, not as a guarantee that survives a change to that assumption.

**Alternatives considered**:
- *Bake an explicit single-RP-instance precondition check into `RevocationService` (e.g., assert
  only one `GrantRecordStore` instance exists at runtime)* — rejected: no such multi-instance
  code path exists anywhere in this codebase to guard against; adding a runtime assertion for a
  scenario the current architecture cannot even produce would be speculative complexity with
  nothing to protect against yet.

**Alternatives considered**:
- *Add an explicit `record.revoked === false` check alongside the existing status check, "to be
  safe"* — rejected: redundant with the status-enum approach (research.md §4) and exactly the
  kind of new-mechanism FR-012 forbids; if the status check alone is provably sufficient, adding a
  second check only creates a second thing that could drift out of sync with the first.

## 6. Package touch-points: `user-client`, not `agent-client`

**Decision**: This feature adds new code to `packages/user-client` (a revocation ceremony client
module, plus a demo script) and leaves `packages/agent-client` untouched — the inverse of
002-transact's stance.

**Rationale**: Revocation is authenticated entirely via the User's passkey-bound identity
(FR-004/FR-005); the Agent has no role in it at all (spec.md Edge Cases). `user-client` is the
package that already hosts the User's WebAuthn ceremony code (`ceremonies/ceremony-one.ts`,
`ceremonies/ceremony-two.ts`) and the Node-compatible software-authenticator test/demo signer
002-transact's own tests already depend on as a devDependency of `rp-server`; the new revocation
ceremony code belongs alongside it, following the exact same `runCeremonyOne()`-shaped pattern
(fetch options → `startAuthentication()` → POST result).

**Alternatives considered**: none — this follows directly from spec.md's own Assumptions and Edge
Cases, not an open design question.

## 7. Testing framework, WebAuthn library, monorepo tooling

**Decision**: Unchanged from 001-grant/002-transact — Vitest, `@simplewebauthn/server` +
`@simplewebauthn/browser`, npm workspaces. Not re-litigated here; see `specs/001-grant/research.md`
§§3, 5, 7. No new dependency is introduced by this feature (research.md §1: no JCS/digest
machinery is needed, since revocation reuses ceremony one's mechanism as-is).
