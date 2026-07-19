<!--
Sync Impact Report
Version change: (template, unratified) → 1.0.0
Rationale for 1.0.0: initial ratification — the constitution file previously contained only
unfilled template placeholders, so this is the first concrete version, not an amendment.

Modified principles: n/a (initial ratification)

Added sections:
- Core Principles I–IX (Authentication Is Not Delegation; Two-Ceremony One-Round-Trip Grant
  Protocol; Assurance-Bound Signed Scope; Bounded Pending-Grant State; Single-Use Artifact
  Consumption Ordering; Dual-Layer Replay Protection; Agent-Held Keys, Never Custodied;
  Lightweight RP-Local Synchronous Revocation; Provenance Over Correctness)
- Explicit Non-Goals (Out of Scope)
- Governance (amendment procedure, versioning policy, compliance review)

Removed sections: n/a

Consolidation note: the seed input listed 14 candidate invariants; several were merged into a
single principle where they described the same mechanism from different angles (e.g. the
"reuse existing WebAuthn mechanisms" and "two-ceremony/one-round-trip" invariants became
Principle II; "no new external standards-conformant surface" was folded into Principle I as
it's the same authentication/delegation boundary viewed from the DPoP-comparison side).

Templates requiring updates:
- .specify/templates/plan-template.md — ✅ no changes needed (Constitution Check gate is
  populated dynamically from this file at plan time; no hardcoded principle names to update)
- .specify/templates/spec-template.md — ✅ no changes needed (generic, no constitution
  references)
- .specify/templates/tasks-template.md — ✅ no changes needed (no constitution references)
- .claude/skills/speckit-*/SKILL.md — ✅ no changes needed (reference constitution.md
  generically; none hardcode principle names)

Follow-up TODOs:
- None blocking. Open Question items from the source documents (e.g., WebAuthn
  digest-as-challenge ceremony conformance, assurance-to-scope policy mapping) are tracked in
  docs/TAC_Proposal_Draft.md §13 and docs/TAC_vs_DPoP_Writeup.md §6, not duplicated here —
  this constitution states the invariants the POC must hold *given* those open questions,
  not their resolutions.
-->

# TAC POC Constitution
<!-- Temporal Agent Credential — proof-of-concept implementation constitution -->

## Core Principles

### I. Authentication Is Not Delegation (NON-NEGOTIABLE)
TAC proves that a specific human authorized a specific agent, at a specific point in time,
with a specific assurance level. It MUST NOT perform delegation/authorization mechanics —
token issuance, API access-pattern enforcement, or scope-to-permission mapping at the resource
layer — which remain the domain of an existing delegation protocol (e.g. OAuth), not this POC.
The POC's new protocol surface (User↔RP negotiation, User↔Agent handoff, RP-local revocation)
is proprietary to this deployment; it MUST NOT modify, extend, or claim conformance with any
standards-conformant external interface (e.g. an OAuth/DPoP token endpoint). If a design
decision would require adding a mandatory non-standard field to a standards-conformant
interface, that decision belongs outside TAC's boundary, not inside it.

Rationale: conflating authentication-provenance with delegation-mechanics is the exact failure
mode this proposal exists to avoid — diluting passkeys' phishing-resistance and human-intent
guarantees across the ecosystem. Keeping the boundary sharp is also what lets TAC avoid
inheriting the integration cost DPoP-extended incurs by changing an AS's external contract.

### II. Two-Ceremony, One-Round-Trip Grant Protocol
Every grant MUST use exactly two WebAuthn ceremonies: (1) a standard authenticating ceremony
with a server-issued challenge, during which the RP and User negotiate scope/duration and the
RP issues a grant-time nonce; (2) a local signing ceremony over the assembled credential digest
(which embeds that nonce), requiring no additional server round-trip. The User's signature over
the credential MUST be produced via a standard WebAuthn assertion ceremony — the POC MUST NOT
ask passkeys to sign arbitrary documents outside their normal WebAuthn-shaped operation, and
MUST NOT invent a parallel signing mechanism where the existing WebAuthn flow suffices.

Rationale: a single combined ceremony would force scope agreement before the RP knows who it's
talking to, making assurance-bound scope provisional rather than real. Reusing WebAuthn's
existing mechanism rather than inventing new crypto keeps the User's signature tied to the same
authenticator/secure-enclave guarantees passkeys already provide.

### III. Assurance-Bound, Signed Scope
The scope and duration the RP agrees to MUST be a function of the passkey assurance level
achieved during the first ceremony — not a fixed or RP-arbitrary grant. That assurance level
MUST be included as a signed field within the credential itself, covered by the User's
signature alongside the identity, scope, and temporal blocks. A credential whose assurance
level is only logged RP-side, and not carried as a tamper-evident signed field, does not
satisfy this principle.

Rationale: without a signed assurance field, the claim "scope was justified by assurance level
at grant time" has no tamper-evident artifact — it collapses into an unverifiable RP-internal
log entry.

### IV. Bounded Pending-Grant State
The RP MUST persist a grant record with status `pending` at the moment the grant-time nonce is
issued (end of ceremony one), and MUST transition it to `active` only once ceremony two's
signed credential is presented and validated against that record. The nonce issued in ceremony
one MUST carry a short, bounded validity window, independent of and shorter than the
credential's own `validFrom`/`validUntil`. If ceremony two does not complete within that
window, the pending grant MUST expire and the nonce MUST become non-redeemable.

Rationale: bounds how long the RP retains pending-negotiation state and prevents a nonce issued
at authentication time from being usable arbitrarily far in the future.

### V. Single-Use Artifact Consumption Ordering (NON-NEGOTIABLE)
Every single-use artifact — grant-time nonce, transaction-time challenge, revocation challenge
— MUST be marked consumed at the moment it is retrieved for verification, before any other
check runs (signature validation, scope check, account lookup). Consuming an artifact only upon
successful verification violates this principle: it leaves the artifact usable for a second
attempt within its validity window if any downstream check fails.

Rationale: this ordering is what actually closes the replay window; treating consumption as a
side effect of success, rather than of retrieval, reopens it.

### VI. Dual-Layer Replay Protection, Not Conflated
The POC MUST maintain two distinct replay-protection layers and MUST NOT collapse them into
one: (a) the grant-time nonce, which prevents the issuance/signing ceremony from being replayed
to mint a second valid grant; (b) session/transaction-time freshness, in which the RP issues a
fresh challenge per transaction and the Agent responds using its own private key. Layer (b) is
intentionally not a passkey ceremony — there is no human presence at transaction time, by
design — and MUST NOT be presented or implemented as if it carries human-presence semantics.

Rationale: these two layers protect against different replay scenarios at different points in
the lifecycle; merging them either weakens one or falsely implies human presence where none
exists.

### VII. Agent-Held Keys, Never Custodied
The Agent MUST generate its own keypair locally; the private key MUST NOT leave the agent or be
transmitted to the User or RP at any point. The default MUST be one Agent keypair per RP, to
prevent cross-RP correlation of agent activity; a per-credential keypair MAY be offered as an
opt-in stronger-privacy variant, but per-RP MUST remain the default.

Rationale: matches passkey precedent of subject-held keys and avoids private-key custody/
transit risk; per-RP-by-default keeps cross-RP correlation from being the path of least
resistance.

### VIII. Lightweight, RP-Local, Synchronous Revocation
The credential MUST remain RP-local and non-reusable: one User, one Agent identity, one RP, one
window, with no cross-RP credential reuse. The POC MUST NOT build or depend on heavyweight
global VC revocation infrastructure (e.g. status lists); revocation MUST instead be an RP-local
endpoint, authenticated via the User's passkey-bound identity, with a challenge cryptographically
bound to the specific credential being revoked (a captured revocation assertion scoped to one
credential MUST NOT be replayable against a different credential held by the same User at the
same RP). The RP MUST check revocation status synchronously on every transaction attempt, with
no propagation delay. Revocation guarantees an immediate halt signal; it does not guarantee
rollback of an in-flight transaction — rollback success is bounded by the RP's own transaction
semantics.

Rationale: heavyweight global revocation is built for long-lived, widely-verified credentials
and is disproportionate to a credential that is short-lived and single-verifier by design;
synchronous local checking is what makes "no propagation delay" true rather than aspirational.

### IX. Provenance Over Correctness; Humans-in-the-Loop for Exceptions Only
The POC proves *who* authorized *what scope*, at *what assurance strength* — it MUST NOT claim,
imply, or be evaluated against a guarantee that an agent's in-scope actions match the User's
specific intent for a specific task. Behavioral divergence within granted scope is explicitly
out of scope and unsolved. Correspondingly, the human MUST be brought back into the loop for
exceptions — out-of-scope attempts, an expired window, or an RP-detected anomaly — and MUST NOT
be required to approve every routine in-scope transaction.

Rationale: overclaiming correctness is the most likely way this POC's findings get
misrepresented; requiring human approval for every routine transaction would defeat the point
of issuing a temporal grant in the first place.

## Explicit Non-Goals (Out of Scope)

- **Initial agent onboarding / enrollment** — TAC assumes an existing passkey relationship
  between User and RP; first-time passkey registration is not addressed.
- **Multi-RP or multi-agent identity federation** — one grant = one User identity = one Agent
  identity = one RP = one window; no reuse or federation beyond that.
- **In-place amendment of an active grant** — a scope/window change is modeled as revoke +
  re-grant, not a separate amendment operation, until this is revisited.
- **Guaranteed rollback of already-settled transactions** — the POC signals halt/rollback
  intent; the actual outcome depends on the RP's own transaction semantics.
- **Defense against RP-side dishonesty about detected assurance level** — the signed credential
  prevents a User-side client from inflating the claimed assurance level, but does not protect
  against an RP misreporting what it detected during ceremony one. That threat requires
  RP-side attestation/audit mechanisms not built here.

## Governance

This constitution supersedes any conflicting practice, code comment, or prior informal
agreement within this repository. Any change to a Core Principle or to the Explicit Non-Goals
list is an amendment and MUST update this file, following the versioning policy below.

**Amendment procedure**: propose the change with its rationale; update this file in the same
change; bump `CONSTITUTION_VERSION` per the policy below; update `Last Amended`; re-run the
consistency check against `.specify/templates/*` and any `speckit-*` command/skill files for
outdated references.

**Versioning policy** (semantic versioning applied to governance):
- **MAJOR**: backward-incompatible removal or redefinition of a Core Principle (e.g. relaxing
  Principle V's consumption ordering, or dropping Principle I's authentication/delegation
  boundary).
- **MINOR**: a new Core Principle or non-goal is added, or existing guidance is materially
  expanded.
- **PATCH**: wording, clarification, or non-semantic fixes that don't change what's required.

**Compliance review**: every plan (`/speckit-plan`) MUST pass the Constitution Check gate
against the principles above before Phase 0 research begins, and MUST be re-checked after
Phase 1 design. Any deviation from a NON-NEGOTIABLE principle (II's ceremony/round-trip
structure, V's consumption ordering) MUST be justified in the plan's Complexity Tracking table
or rejected outright — it MUST NOT be silently implemented.

**Version**: 1.0.0 | **Ratified**: 2026-07-17 | **Last Amended**: 2026-07-17
