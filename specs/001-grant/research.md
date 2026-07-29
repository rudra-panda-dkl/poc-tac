# Phase 0 Research: TAC Grant Flow (001-grant)

## 1. Ceremony-two WebAuthn conformance (Constitution Principle II gate — resolves plan-level validation of FR-004 / spec OQ-1)

**Decision**: Implement ceremony two as a standard `navigator.credentials.get()` WebAuthn
assertion, with `challenge` set to the SHA-256 digest of the JCS-canonicalized credential content
(identity + scope + temporal + assuranceLevel + grantNonce). No new network call is made between
the end of ceremony one (nonce issuance) and the start of ceremony two; the browser computes the
challenge locally from data already delivered in ceremony one's response plus data assembled
during negotiation.

**Rationale**: The WebAuthn spec (Level 2/3, §5.1.3 `PublicKeyCredentialRequestOptions.challenge`)
defines `challenge` as an arbitrary `BufferSource` chosen by the relying-party script — it does
not mandate that the challenge be freshly fetched from a server at the moment `get()` is called,
only that the *overall* ceremony resist replay. FR-004's freshness requirement is satisfied
because the challenge is a deterministic function of the grant nonce, and the grant nonce itself
is server-issued, single-use (FR-014/FR-015), and bound to a short validity window (FR-012) — so
replay protection is inherited from the nonce layer rather than from challenge randomness fetched
at ceremony-two time. `@simplewebauthn/browser`'s `startAuthentication()` accepts any
caller-supplied challenge buffer, so no library modification is needed.

**Alternatives considered**:
- *Fetch a fresh server challenge before ceremony two* — rejected: reintroduces the round-trip
  FR-004/Constitution Principle II explicitly forbids.
- *Non-WebAuthn local signing (e.g., raw WebCrypto signature over the digest, bypassing
  `navigator.credentials`)* — rejected: violates FR-005 and Constitution Principle II's
  requirement that the User's signature come from a standard WebAuthn assertion ceremony.

**Fallback (if implementation-time browser/authenticator testing reveals a specific
authenticator or browser rejects or mishandles a challenge not obtained via a just-prior
`get()`-options server call)**: add a purely confirmatory RP round-trip that echoes back the
*already-locally-computed* digest unchanged (the RP does not generate new randomness or new
terms) immediately before ceremony two. This preserves the no-new-freshness-fetched spirit of
FR-004 (nothing about the grant is renegotiated or re-randomized) while adding the minimal network
hop needed if a specific real-world authenticator implementation requires it. This fallback MUST
be validated against real browser/authenticator behavior as an early implementation task
(tasks.md Phase 2, T006) before the rest of the grant flow is built on top of it — this research
document is a design-time analysis, not a substitute for that empirical check.

**Outcome (T006, validated 2026-07-22)**: **PASS — primary approach confirmed, fallback not
needed.** A standalone harness (`spikes/001-grant-webauthn-conformance/`) drove a real Chromium
129 WebAuthn implementation via a CDP virtual authenticator (`WebAuthn.addVirtualAuthenticator`,
`hasUserVerification`/`isUserVerified: true`, `automaticPresenceSimulation: true` — no physical
hardware or human presence required, matching quickstart.md's Prerequisites):

1. Registered a credential (`navigator.credentials.create()`) standing in for the out-of-scope
   passkey-registration precondition.
2. Computed a challenge entirely client-side (a sorted-key JSON digest, standing in for the JCS
   digest — this spike tests challenge-acceptance mechanics, not JCS correctness, which is
   separately unit-tested per tasks.md T042) — with **zero** network calls after step 1.
3. Called `navigator.credentials.get()` (ceremony two) with that locally-computed digest as
   `challenge` and confirmed it resolved successfully, with `clientDataJSON.type ===
   "webauthn.get"` and `clientDataJSON.challenge` matching the locally-computed digest
   byte-for-byte.

This empirically confirms the WebAuthn spec analysis in the Decision above: Chromium's assertion
API does not require the `challenge` to originate from a fresh server call, so FR-004's
no-round-trip requirement is achievable exactly as designed — **T024/T025's ceremony-two
implementation should proceed on the primary approach, not the fallback.**

**Residual, explicitly untested scope** (acceptable for this POC, not blocking): (a) real physical
hardware authenticators (Touch ID, Windows Hello, USB security keys) were not exercised — only a
CDP-simulated software authenticator was; residual risk is judged low since CTAP2's challenge
handling is uniform across authenticator implementations, but a spot-check with real hardware
would close this gap if one becomes available. (b) Firefox and WebKit were not validated — the
CDP `WebAuthn` domain used here is Chromium-specific and has no equivalent automation surface in
Playwright for those engines; a version-alignment issue when attempting to launch Firefox for an
even preliminary CDP-support check was not pursued further, as disproportionate to this POC's
scope. If the POC's target browser expands beyond Chromium-based browsers, this residual gap
should be revisited before relying on the no-round-trip design there.

## 2. Credential canonicalization library

**Decision**: `canonicalize` (npm), the reference implementation of RFC 8785 (JSON
Canonicalization Scheme) by the RFC's author.

**Rationale**: Directly implements the exact algorithm FR-021/OQ-6 specifies (sorted object keys,
fixed `ECMA-262`-compatible number/string serialization); used identically by `packages/shared` on
both the User-signing side (`user-client`) and the RP-verification side (`rp-server`), so there is
a single implementation to keep in sync rather than two independent ports of RFC 8785.

**Alternatives considered**:
- *Hand-rolled canonical serializer* — rejected: RFC 8785 has non-obvious number-formatting edge
  cases (e.g., `-0`, exponent forms); a hand-rolled version risks exactly the byte-mismatch FR-021
  exists to prevent.
- *Deterministic CBOR* — rejected in the OQ-6 clarification already recorded in spec.md; not
  re-litigated here.

## 3. WebAuthn library

**Decision**: `@simplewebauthn/server` (RP-side ceremony one registration/authentication
options + verification) and `@simplewebauthn/browser` (User-client ceremony orchestration).

**Rationale**: Most actively maintained open-source WebAuthn library pair for Node/TypeScript;
directly exposes the low-level options needed to set a caller-supplied `challenge` for ceremony
two (§1 above), which several higher-level "batteries-included" auth frameworks abstract away.

**Alternatives considered**: `py_webauthn` (Python) and `go-webauthn` (Go) — both viable but
would require the Agent client and shared canonicalization module to be reimplemented per-language
if either were paired with a different-language User client; TypeScript across all three actors
keeps `packages/shared` a single implementation (see Project Structure in plan.md).

## 4. Agent keypair algorithm

**Decision**: ECDSA over P-256 (COSE algorithm ES256), generated via Node's WebCrypto
`SubtleCrypto.generateKey`.

**Rationale**: Matches the algorithm family WebAuthn passkeys themselves commonly use, so the RP's
signature-verification code path can share primitives (P-256 ECDSA verify) across both the User's
WebAuthn signature and the Agent's keypair, rather than maintaining two unrelated crypto stacks
for a POC. WebCrypto's `SubtleCrypto` is available natively in both Node.js and browsers, so if a
future feature moves Agent-side logic into a browser context, no library swap is needed.

**Alternatives considered**: Ed25519 — strong modern choice with simpler constant-time semantics,
but Node's WebCrypto Ed25519 support is newer/less uniformly available across LTS versions than
P-256 ECDSA; rejected for this POC to avoid a runtime-version constraint not otherwise needed.

## 5. Testing framework

**Decision**: Vitest.

**Rationale**: TypeScript-native (no separate ts-jest transform step), fast, and shares a single
config shape across the four packages (`shared`, `rp-server`, `user-client`, `agent-client`) in
the npm-workspaces monorepo.

**Alternatives considered**: Jest — mature and equally capable, but requires more TypeScript
transform configuration; not chosen given no existing project convention pulls toward it.

## 6. Grant Record storage

**Decision**: In-memory, process-local keyed map (keyed by grant nonce), owned by `rp-server`.

**Rationale**: Matches this POC's single-RP-instance scale (spec Assumptions) and the short grant
nonce/credential lifetimes described in FR-012 — no cross-restart durability is required for a
POC demonstrating the protocol, and it avoids introducing database setup/migration overhead not
otherwise needed for this feature.

**Alternatives considered**: SQLite file-backed store — would survive process restarts, but adds
schema/migration overhead with no corresponding requirement in the spec; can be swapped in later
without changing the Grant Record shape (data-model.md) if a future feature needs durability.

## 7. Monorepo tooling

**Decision**: npm workspaces (no additional monorepo tool like Turborepo/Nx for this POC).

**Rationale**: Four small packages sharing one canonicalization dependency is well within what
native npm workspaces handles; adding a build-orchestration tool would be complexity this POC
doesn't need yet.

**Alternatives considered**: Turborepo — rejected as unnecessary tooling weight for a 4-package
POC with no complex build-caching requirement.
