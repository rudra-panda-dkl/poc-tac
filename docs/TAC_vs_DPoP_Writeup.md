# Temporal Agent Credential (TAC) vs. DPoP — Human-in-the-Loop for Autonomous Agents

**Status:** Draft for AATWG discussion — July 14, 2026.

TAC was first presented to the working group at the June 30, 2026 AATWG meeting. This document is the requested follow-up comparative analysis against DPoP.

Main body compares TAC against DPoP-extended using the Authorization Code Grant, selected over an assertion-based alternative (preserved in the Appendix) on the criterion "closer to standard, minimal extensions." One limitation is carried forward explicitly rather than resolved: this DPoP variant's signed bundle does not carry `assuranceLevel` — tracked as unavailable, not fixed.

---

## Core Message (six points)

1. **"Is TAC just DPoP?" is the wrong question.** The real question is whether any existing protocol can prove *who authorized this specific agent, with what strength* — and neither OAuth nor DPoP was ever built to answer that. Their one-time-consent model was safe only because a client's behavior was fixed at registration. Agents break that assumption by design, not by accident.

2. **This paper doesn't argue the answer — it builds it.** A complete, RFC-cited DPoP extension, checked phase by phase against what it actually costs. Every claim traces to a specific section, not a vibe about what OAuth "is like."

3. **The cost isn't evenly spread — and that's the real finding.** Transaction (day-to-day resource access) needs zero changes to standard DPoP. The "sounds like OAuth with DPoP" challenge is right about that part. All the real engineering weight sits at the edges: issuance, and especially revocation.

4. **Revocation is where "extend DPoP" stops being a style choice and becomes a wall.** TAC-equivalent revocation requires the User to call an endpoint holding a token they never received — RFC 7009 has no concept for this. Not a missing feature. A mismatch between who delegates and who the spec assumes revokes.

5. **TAC proves provenance, not correctness.** The signature proves a real human authorized a real agent, at a known assurance level. It says nothing about whether the agent's next in-scope action is actually right. That problem stays open — deliberately not claimed as solved.

6. **The real choice isn't mature protocol vs. new primitive — both require building something new.** TAC needs new machinery too (negotiation, delivery channels, a rollback mechanism) — but it's proprietary to this deployment, never claiming to interoperate with unrelated implementations in the first place. DPoP-extended's new surface sits differently: it changes the external contract of an interface that presents itself as standards-conformant — the AS's token endpoint gains a mandatory non-standard claim — plus one mechanism (User-initiated revocation) that isn't just new, but currently has no answer at all.

---

## Responses to Raised Questions

**"Doesn't this sound like OAuth with DPoP?"**

A fair read, and worth taking seriously rather than deflecting. Key possession is a real trust signal — DPoP proves whoever is transacting still holds the key the token was bound to. But possession answers *which party is acting*, not *which party was authorized to act in the first place*. RFC 9449 §11.11 is explicit that a DPoP proof carries no binding to identity or a prior authentication event; the AS trusts a key because it showed up in the right request, not because anyone signed off on it being *that* key. Concretely: nothing in standard DPoP distinguishes the Agent the User meant to authorize from any other key that happened to arrive at the token endpoint during the same session. Section 4.1 shows exactly what closing that gap costs — a new claim, a new AS-side check, a new integration requirement (rows 14, 19). So the honest answer is: DPoP is the right tool for proving possession, and this analysis keeps it exactly where it belongs (Section 4.2 needs zero changes to it). The open question was never whether DPoP works — it's what has to be added *around* it to answer a question it was never designed to answer.

**"Why not just revert to vanilla OAuth once the agent is trusted?"**

Good instinct, since simplicity should always be the default unless something specific justifies added complexity. Here, the complexity earns its place: "vanilla OAuth after trust is established" still only carries whatever the AS operator chose to encode into the token, with no mechanism forcing re-attestation on any schedule. A refresh token's validity is a configuration setting, not a provable boundary. Section 3 covers why that distinction matters specifically for agents — the one-time-consent model was safe for classic OAuth clients because their behavior was fixed at registration; it doesn't carry the same guarantee once the client's actions are generated at runtime.

**"Is this really about fighting scope explosion? A short-lived, narrowly-scoped token might do the same job."**

This is a sharp question, and it deserves a precise answer rather than a general one. A short-lived, narrow-scope token is a genuinely good pattern — but it solves *authorization precision* (how much can this token do), not *authorization provenance* (who specifically decided to grant it, and how verifiably). A tightly-scoped token can still be issued on nothing more than client-level trust, with no re-verifiable link back to a human decision. The two problems look adjacent but aren't the same one, which is why solving one doesn't dissolve the need for the other.

**"Isn't there confusion between RP, AS, RS, and the User in the WebAuthn sense?"**

This was a genuinely useful catch, and it's why Section 4 keeps each protocol's native vocabulary rather than collapsing everything into "Relying Party." The short version: one physical entity (the person) is Resource Owner in OAuth, User in WebAuthn, and Issuer in the VC model — three correct labels for the same party, not three different parties. The bank's backend plays AS and RS as two distinct OAuth roles depending on which phase of the flow you're looking at (Section 4.1's Grant phase is AS; Section 4.2's Transaction phase is RS) — that split is now explicit throughout rather than implied.

**"Should the agent generate its keypair earlier, to simplify the flow?"**

Appreciate this one — it's the kind of question that looks like a simplification but turns out to touch the security model directly. If the Agent's key exists *before* the User's signing ceremony, nothing has bound that specific key to the User's decision yet — the signature only means something because it comes after the key exists and names it. Generating the key earlier doesn't simplify the flow; it removes the binding the flow exists to create.

**On the request for a comparative analysis.**

This document is that analysis, built the way we'd want it checked: every claim traced to a specific RFC section, every extension DPoP would need named and costed explicitly rather than gestured at, and every place TAC has a real limitation (assurance-binding parity, behavioral divergence within scope) stated as plainly as every place it has an advantage.

---

## 1. Objective Statement

**Problem being addressed:**

Autonomous agents act on behalf of users with runtime-generated, non-enumerable behavior. Existing authentication/authorization protocols (OAuth 2.0, DPoP) were not designed against this actor model. This document evaluates what's required to establish verifiable, assurance-graded human authorization for agent delegation — and whether existing protocols can be extended to provide it, or require a new primitive.

**Explicit scope boundary:**

- **In scope:** provenance and assurance-strength of the delegation/grant event — can a relying party verify that a specific human authorized a specific agent, with what strength of authentication, at what point in time.
- **Out of scope:** in-scope behavioral correctness of the agent after grant — whether a given action matches the user's specific intent for a specific task, even when that action falls within granted scope. This is a separate, unsolved problem, not addressed by any mechanism evaluated here (see Section 3).

**Evaluative stance:**

- This is not an argument for TAC. TAC and DPoP-extended are both evaluated as candidate solutions to the same problem, on engineering merit.
- Claims are grounded in protocol specification text (RFC 6749, RFC 9449, RFC 7009, RFC 7523, RFC 7591, RFC 7662, WebAuthn/FIDO2) and the TAC Proposal presented at the June 30, 2026 AATWG meeting, not general characterization.
- Where a claim is a design choice rather than a settled fact, it is marked as such, not presented as inevitable.

---

## 2. Why OAuth/DPoP Never Had to Solve This

**Classic OAuth client — behavior fixed at registration time.**
RFC 6749 §2 requires client registration (client ID, redirect URI) before token issuance. The client is a fixed, pre-written code path — same input, same output, every time. Scope, once granted, is an accurate enumeration of everything the client can ever do, because the client's decision space was fixed before the human consented. Consent-to-scope = consent-to-behavior. One-time authorization is sufficient because there's nothing left to authorize later.

**What OAuth's consent step actually is, mechanically.**
An authentication event of unspecified strength — RFC 6749's own flow diagrams (Figures 3–4) just show "User authenticates," no method mandated — followed by an authorization decision (scope grant) that is not cryptographically tied to that authentication event in any way the resource server can independently check. The RS trusts the AS's say-so. This was sufficient precisely because the fixed-decision-space property above meant nothing further needed re-verifying after that one event.

**What DPoP adds.**
Proof of key possession at request time (RFC 9449). Orthogonal to authentication strength — doesn't touch it, doesn't bind to it. RFC 9449 §11.11 states this directly: DPoP proof is not cryptographically bound to a co-occurring authentication event; stronger binding is "beyond the scope of this specification."

**Agent — behavior generated at runtime.**
An agent's next action is produced by interpreting task input against available tools, not by executing a fixed code path. Same scope, different task input → different, non-enumerable actions. The fixed-decision-space property classic clients had is absent.

**The gap, precisely.**
Neither protocol produces a verifiable, assurance-graded record of *who* authorized a given delegation and *how strongly* they were verified. Not a design flaw in either — never their target. OAuth's target: prevent password sharing. DPoP's target: prevent token replay.

**What closes that specific gap.**
An authentication mechanism whose output is independently verifiable and assurance-graded. WebAuthn's UP/UV flags are the closest existing standard to this.

**Why not OIDC's `acr`/`amr` instead.**
`acr`/`amr` are the standard existing mechanism for communicating authentication strength across a network boundary — a genuinely competing candidate, not one to wave past. But OIDC is a separate layer on top of OAuth (the same layering gap noted above — OAuth itself never defines authentication, which is why OIDC exists at all). Concretely: `acr`/`amr` live in an ID Token issued to the *Client* at token response; nothing in standard OIDC threads them into the access token or a DPoP proof the Resource Server actually checks. Using `acr`/`amr` here wouldn't just require adding OIDC — it would require solving a second problem (getting the claim from the ID Token into something RS-visible) before it did the job UP/UV already does natively, inside the single ceremony that produces it. UP/UV isn't chosen by default; it's chosen because it doesn't need that extra threading step. This simplicity claim carries a dependency worth stating: it assumes the digest-as-challenge pattern used at row 12 (no server round-trip) is itself a valid WebAuthn ceremony — which is Open Question #1, not yet resolved. If it turns out not to satisfy WebAuthn semantics as specified, closing that gap may require its own extension, narrowing UP/UV's simplicity advantage over `acr`/`amr` by some amount not yet known.

**Explicitly not claimed here:** that this closes the behavioral-divergence problem named in Section 1's scope boundary. This section establishes provenance-of-grant only — whether that's sufficient or merely necessary for the broader agent problem is left open.

---

## 3. What TAC Actually Solves, Precisely Scoped

**Mechanism.**
A passkey-signed Verifiable Credential naming a specific Agent public key, scope, duration, and `assuranceLevel` — a declared field on the credential itself, not an inferred property. The signature is produced via WebAuthn ceremony (UP/UV), at grant time only.

**What this closes.**
Provenance and assurance-strength of the grant event, independently verifiable by the RP without depending on the AS's internal, unlogged consent process. Where OAuth's grant is "the AS's say-so" (Section 2), TAC's grant is a signed artifact the RP can check against the User's registered public key directly — non-repudiable, tamper-evident, and carrying a declared assurance-strength value rather than an inferred or absent one.

**What this does not close — stated explicitly, not implied.**
TAC does not add precision to scope. The credential's scope block is the same granularity of boundary as OAuth's `scope` parameter — a category of permitted action, not a specific-action-matches-specific-intent guarantee. An agent authorized under TAC to "book travel" can still book a valid-but-wrong itinerary, entirely within signed scope. The signature does not touch this; it only makes the boundary-setting event itself verifiably human and assurance-graded.

**The precise distinction.**
TAC answers *how trustworthy was the event that set this boundary* — not *how tightly does the boundary constrain what happens next*. These are different properties. The first is what Section 2 identified as missing from OAuth/DPoP. The second — behavioral divergence within scope — remains unsolved by any mechanism evaluated in this document (per Section 1's explicit scope boundary), and is not claimed to be solved by TAC's signature.

**Relationship to duration.**
Same treatment as scope: duration is a user-proposed, RP-agreed boundary, carried in the signed credential. Its value is tamper-evidence (not silently extensible without a new signature) and a fail-safe ceiling for a user who doesn't actively revoke — not a guarantee that actions taken within the window match intent.

---

## 4. Can DPoP Be Extended to Do This

TAC is compared against DPoP-extended using the **Authorization Code Grant** — selected over an alternative assertion-based variant (preserved in the Appendix, Section 7) on the criterion "closer to standard, minimal extensions": RFC 6749 §4.1 is kept fully intact and unmodified; the delegation mechanism is additive only, riding inside a new DPoP proof claim rather than replacing the grant type. One limitation is carried forward explicitly rather than resolved: this variant's signed bundle does not carry `assuranceLevel` — tracked as unavailable for DPoP, not fixed (Grant row 21).

### 4.1 Grant (Issuance)

**Note on numbering:** step numbers below are not continuous within either diagram — this is intentional, not an error. TAC and DPoP share one union numbering scheme across both flows: a step shared by both branches keeps one number (e.g., step 1, authenticate via passkey); a step unique to one branch gets its own number and is simply absent from the other's diagram (e.g., steps 3–5 are TAC-only negotiation steps and don't appear in the DPoP diagram; steps 6–7 are the DPoP-only OAuth redirect grant and don't appear in TAC's). This keeps a given step number referring to the same thing in both diagrams and in the comparison table below, at the cost of each individual diagram's numbers skipping around rather than running 1, 2, 3, 4... in sequence.

![TAC Grant](diagrams/authcode_tac_grant.png)

![DPoP Grant](diagrams/authcode_dpop_grant.png)

**Structural finding:** TAC persists an explicit **pending** grant record (row 5) that is later checked and activated (row 22). The DPoP (Auth-Code) variant has **no equivalent concept at all** — no pending record; only ordinary OAuth code/PKCE state plus the new `delegation` claim. This is an architectural difference between the two designs, not an oversight in either.

| # | Step | TAC data elements | DPoP (Auth-Code) data elements | Design Status | Protocol / Role | Feasibility Check |
|---|---|---|---|---|---|---|
| 1 | Authenticate via passkey | WebAuthn assertion {clientDataJSON, authenticatorData(UP/UV), signature} — UP/UV are the source of `assuranceLevel`, used at rows 4/11/21 below | Same | Resolved | WebAuthn/FIDO2 — User(Authenticator)→RP | Feasible, standard |
| 2 | Auth success | status, plus `assuranceLevel` derived from row 1 | status | Resolved | HTTP/session — RP→User | Feasible |
| 3 | Propose scope+duration | {proposed scope, duration} | N/A | Resolved (TAC-only) | No standard protocol — User→RP | Feasible, informal |
| 4 | Agree scope+duration, issue nonce | {agreed scope, duration, nonce} | N/A | Resolved (TAC-only) | No standard protocol — RP→User | Feasible, informal |
| 5 | Persist pending record | {User pubkey ref, scope, duration, nonce, pending} | N/A | Resolved (TAC-only) | Internal — RP self | Feasible |
| 6 | Authorization request (redirect) | N/A | {response_type=code, client_id, redirect_uri, scope, code_challenge} (PKCE) | Resolved — standard, unmodified | RFC 6749 §4.1 — User/Client→AS | Feasible, standard |
| 7 | Authorization code | N/A | {code, state} — received by User/Client | Resolved — standard, unmodified. RFC 6749 §4.1.2: code must be short-lived, single-use | RFC 6749 §4.1 — AS→User/Client | Feasible, standard |
| 8 | Inform/instruct Agent | TAC: {RP id, scope, duration} — User→Agent / DPoP: {intent signal only, no terms} — User→Agent | N/A shared position | TAC: Resolved (channel unspecified, flag) / DPoP: **Line in the sand for this paper** — mechanism out of scope, not a blocker. Substitutes for the missing link a browser-redirect client gets implicitly (User present in the same flow); an autonomous Agent has none. | No named/standard protocol — User→Agent, both branches | Feasible, channel unspecified in both |
| 9 | Generate keypair | {Agent pubkey, private key (local)} | Same | Resolved | WebCrypto/local — Agent self | Feasible, no constraint |
| 10 | Present Agent pubkey | {Agent pubkey} | Same | Resolved | No named protocol — Agent→User | Feasible, channel unspecified |
| 11 | Assemble credential/digest | {Identity, Scope, Temporal, assuranceLevel, Integrity[nonce]} — full W3C VC schema | {code, code_verifier, Agent pubkey} | Resolved both — same mechanism, different payload (TAC: full VC; DPoP: minimal bundle, no assuranceLevel — **accepted limitation, see row 21**) | W3C VC (TAC) / ad hoc (DPoP) — User self | Feasible (local assembly), both |
| 12 | Sign — 2nd ceremony, challenge=digest | WebAuthn assertion #2 over digest | Same mechanism, digest = hash(code, code_verifier, Agent pubkey) | Open — Open Question #1 (shared, pre-existing): does "challenge=digest, no server round-trip" satisfy WebAuthn ceremony semantics as specified? | WebAuthn — User(Authenticator), RP origin context | Constrained — must run in RP's origin, in User's browser; not headless/Agent-executable |
| 13 | Deliver signed artifact to Agent | signed VC | {code, code_verifier, Agent pubkey, signed bundle} | Resolved | No named protocol — User→Agent | Feasible, channel unspecified |
| 14 | Agent-self action before presentation | TAC: Holder countersignature over credential (VP convention) | DPoP: builds DPoP proof for token request, header {typ:dpop+jwt, alg, jwk=Agent pubkey}, payload {jti, htm=POST, htu=token_endpoint, iat, **delegation**} | TAC: Resolved (terminology note, VP vs. credential) / DPoP: **New `delegation` claim — proposed extension, not part of RFC 9449.** Payload = raw WebAuthn assertion from row 12, `{clientDataJSON, authenticatorData, signature}`. Does not duplicate code/verifier/pubkey — already present elsewhere in the same request. | TAC: W3C VC (VP convention) / DPoP: RFC 9449 + new claim — Agent self | Feasible both |
| 15 | Agent presents/submits to RP or AS | TAC: full signed VC presented to RP(Verifier) | DPoP: token request `{grant_type=authorization_code, code, code_verifier, redirect_uri, client_id}` (RFC 6749 §4.1.3, unmodified) + DPoP proof header from row 14 | Resolved both. DPoP's standard OAuth fields are entirely unmodified — the delegation mechanism rides only inside the DPoP proof, not the request body. | TAC: HTTPS/W3C VC — Agent(Holder)→RP(Verifier) / DPoP: RFC 6749 §4.1.3 + RFC 9449 — Agent(Client)→AS | Feasible both |
| 16 | RP looks up User pubkey | — | N/A | Resolved (TAC-only) | FIDO2 credential store — RP self | Feasible, assumes existing store — same underlying capability RP already needed for row 1's passkey ceremony, not a new requirement. See row 19 for why the DPoP-side equivalent is costed differently despite this symmetry. |
| 17 | AS validates DPoP proof (standard portion) | N/A | — | Resolved — standard, unmodified. RFC 9449 §4.3 "Checking DPoP Proofs": well-formed, `typ`/`alg` valid, sig valid vs. `jwk`, `htm`/`htu` match, `iat` window, `jti` not replayed. | RFC 9449 §4.3 — AS self | Feasible, standard |
| 18 | AS validates code + PKCE | N/A | — | Resolved — standard, unmodified. Code validity/single-use per RFC 6749 §4.1.3; `code_verifier` vs. `code_challenge` per RFC 7636 §4.6 (distinct RFC, not conflated with 6749). | RFC 6749 §4.1.3 + RFC 7636 §4.6 — AS self | Feasible, standard |
| 19 | AS validates `delegation` claim | N/A | — | **New AS-side check, not defined by any RFC examined.** Validates the WebAuthn assertion inside `delegation` against User's registered passkey pubkey (requires AS/WebAuthn-RP coupling); confirms signed content — reconstructed as hash(code, code_verifier, Agent pubkey) — matches this request's own code/verifier/`jwk`. | No standard protocol — AS self | **Requires non-standard AS/WebAuthn-RP integration** — mechanism is well-specified in isolation, integration point is not. The capability itself isn't asymmetric versus row 16 (both RP and AS already needed WebAuthn verification for row 1's passkey ceremony), and this holds regardless of whether AS and RP are the same operator's backend (see "Responses to Raised Questions" above). The asymmetry isn't about who runs the system — it's that the AS's token endpoint presents itself as a standards-conformant OAuth/DPoP interface (RFC 6749/9449) that any compliant client is entitled to interact with as specified; adding a mandatory non-standard claim changes that endpoint's external contract. TAC's RP endpoints never claimed that conformance in the first place, so extending their bespoke behavior changes nothing any other implementation was relying on. |
| 20 | RP validates sigs+terms+nonce vs. pending record | vs. pending record (row 5) | N/A | Resolved (TAC-only) — no DPoP equivalent since DPoP has no persisted pending record (see structural finding above) | Internal+WebAuthn+VC — RP self | Feasible |
| 21 | RP/AS confirms assuranceLevel | vs. negotiation (row 4) | **N/A — accepted limitation.** This DPoP variant's bundle (row 11) never carried `assuranceLevel`; there is no comparison target and no plan to add one for this variant. Tracked as unavailable, not fixed. | TAC: Resolved (field comparison) / DPoP: **Not available** | Internal — RP/AS self | TAC: Feasible / DPoP: N/A by design choice |
| 22 | RP updates record → active / AS mints token | TAC: internal record flip / DPoP: mints token, binds `jkt` — {access_token, token_type=DPoP, cnf.jkt=thumbprint(Agent pubkey)} | Resolved both — same position (grant becomes usable), different artifact (record vs. token). DPoP: standard RFC 9449 mechanics (RFC 7638 for thumbprint), but trust in this key is now conditioned on row 19 passing, not key possession alone. | TAC: Internal — RP self / DPoP: RFC 9449 §6.1 ("JWK Thumbprint Confirmation Method" — the actual binding mechanism; §5 only covers the token request itself), RFC 7638 — AS self | Feasible both |
| 23 | RP determines scope+TTL by assurance | bound to assuranceLevel by design (TAC Proposal §2) | N/A — DPoP's scope/TTL come from ordinary OAuth policy at rows 6/7, not assurance-based (consistent with row 21's accepted limitation) | Parity/comparison note for TAC; not a distinct DPoP step | RFC 6749 policy (DPoP) / TAC Proposal §2 (TAC) | N/A for DPoP by design choice |
| 24 | AS delivers token response | N/A | {access_token, token_type=DPoP, expires_in, scope} — delivered to Agent | Resolved — standard, unmodified | RFC 6749 §4.1.3 — AS→Agent | Feasible, standard |
| 25 | Grant acknowledged | RP→User, closing message | **N/A — confirmed asymmetry.** This DPoP variant has no equivalent closing message to User; User receives no confirmation the delegation succeeded, since User has no further role after row 8. | TAC: Resolved/optional | No standard protocol — RP→User (TAC only) | TAC: Feasible / DPoP: no step exists |

### 4.2 Transaction (Resource Access)

![TAC Transaction](diagrams/authcode_tac_transaction.png)

![DPoP Transaction](diagrams/authcode_dpop_transaction.png)

**Presented as two independent sequences, not forced into shared numbering.** Unlike Grant phase, the Transaction mechanisms are fundamentally distinct — TAC uses live challenge-response against a persisted credential record at RP; DPoP uses a one-time-issued token checked locally at RS, with no re-consultation of AS. Forcing a shared row structure obscured this rather than clarifying it.

**TAC — Transaction**

| # | Step | Data elements | Design Status | Protocol / Role | Feasibility Check |
|---|---|---|---|---|---|
| 1 | Request transaction | bare request | Resolved | No standard protocol — Agent→RP | Feasible |
| 2 | Check persisted record (active/in-scope/in-window) | — | Resolved — structural, synchronous revocation | Internal — RP self | Feasible |
| 3 | Issue fresh challenge | — | Resolved, primary path. **Optional simplification, health-warned:** MAY skip rows 3–5 and have Agent proactively generate a proof instead (DPoP-style), inheriting DPoP's known pre-generation/replay exposure (RFC 9449 §11.2), closed only by §9 server-nonce mode. Not adopted as primary. | No standard protocol — RP→Agent | Feasible |
| 4 | Sign challenge with private key | signs the server-issued challenge (row 3) | Resolved | WebCrypto/local — Agent self (not WebAuthn; Agent has no authenticator role) | Feasible |
| 5 | Respond to challenge | — | Resolved | No standard protocol — Agent→RP | Feasible |
| 6 | Validate signature+freshness | validates against its own issued challenge (row 3) | Resolved | Internal — RP self | Feasible |
| 7 | Transaction permitted | — | Resolved, explicit step | No standard protocol — RP→Agent | Feasible, optional (UX) |
| 7a | (RP-internal) Obtain/mint OAuth access token for RP's own API | RFC 6749 (client-credentials or internal pattern) — RP self; **not exposed to Agent, TAC stays token-free at the Agent boundary** | Architecture-dependent, optional — completes TAC Proposal §11's stated OAuth relationship | RFC 6749 §4.4 — RP self | Feasible where applicable |
| 8 | Execute transaction | — | Resolved | Internal — RP self | Feasible |

**DPoP (Auth-Code) — Transaction**

| # | Step | Data elements | Design Status | Protocol / Role | Feasibility Check |
|---|---|---|---|---|---|
| 1 | Build DPoP proof | `{jti, htm, htu, iat, ath=hash(access_token)}`, proactively | Resolved — standard | RFC 9449 — Agent self | Feasible, standard; no round trip |
| 2 | Submit resource request | request bundled with {Authorization: DPoP token, DPoP: proof from row 1} | Resolved, standard | RFC 9449 — Agent→RS | Feasible, standard |
| 3 | Validate token | — | Resolved — standard, unmodified. Signature/exp/scope, or introspection if opaque (RFC 7662). No TAC counterpart — TAC never issues a token to Agent, tokenless per TAC Proposal §11, not an oversight. | RFC 6749/9449 — RS self | Feasible, standard |
| 4 | Validate DPoP proof | — | Resolved — standard RFC 9449 §7.1: sig vs. `jwk`, computed `jkt` matches token's `cnf.jkt`, `htm`/`htu`/`iat`/`ath`/`jti` checks | RFC 9449 §7.1 — RS self | Feasible, standard |
| 5 | Deliver resource response | — | Resolved — combines execute+respond into one step | RS self, RFC 9449 | Feasible, standard |

**No flagged/extension steps in DPoP's Transaction phase** — this is the one phase that is entirely standard RFC 9449, unmodified. All of DPoP's non-standard machinery is concentrated in Grant and Revocation, not here.

### 4.3 Revocation

![TAC Revocation](diagrams/authcode_tac_revocation.png)

![DPoP Revocation](diagrams/authcode_dpop_revocation.png)

**Structural note:** TAC's revocation check happens at the *same entity* that processed the revocation (RP checks its own persisted record). DPoP's is processed at the AS but checked at the RS — a *different* entity — so synchronicity depends on optional introspection. A more fundamental issue precedes that: row 1 establishes User cannot even *initiate* revocation as specified in this Grant design, since User never holds the token.

| # | Step | TAC data elements | DPoP (Auth-Code) data elements | Design Status | Protocol / Role | Feasibility Check |
|---|---|---|---|---|---|---|
| 1 | Call revocation endpoint | {revocation request} | {token to be revoked} — **caller undefined** | TAC: Resolved / DPoP: **Blocked (caller undefined)** — RFC 7009 §2.1 requires the caller to present the token or be the authenticated client; token is Agent-only (Grant row 24), User has neither. Confirmed to apply generally to DPoP-extended, not specific to this grant type. | TAC: no standard protocol — User→RP / DPoP: RFC 7009 §2.1 — caller undetermined | TAC: Feasible / DPoP: **Not feasible as specified** |
| 2 | Mark/flip status to revoked | persisted record status = revoked | AS-side token invalidation | Resolved both, synchronous at the authority — scope differs (see structural note) | TAC: internal — RP self / DPoP: RFC 7009 §2.1 — AS self | Feasible both |
| 3 | Attempt transaction (in-flight or new) | — | token + DPoP proof presented | Resolved. **Critical structural difference:** TAC's RP is the same entity that processed revocation; DPoP's RS is a *different* entity from the AS that processed it — cross-entity synchronization required. | TAC: no standard protocol — Agent→RP / DPoP: RFC 9449 — Agent→RS | Feasible both |
| 4 | Check status | direct persisted-record lookup, same entity/store as row 2 | validates token's own local claims (sig, exp) only | TAC: Resolved / DPoP: **Parity gap vs. TAC** — does not see AS-side revocation by default | TAC: internal — RP self / DPoP: RFC 9449 local validation — RS self | Feasible; DPoP incomplete without row 5 |
| 5 | RS queries AS for current status (optional) | N/A | introspection request/response | **Proposed extension (open)** — not default; required to close row 4's parity gap | RFC 7662 — RS→AS | Feasible; adds latency + AS dependency per transaction |
| 6 | Deny + signal | explicit {deny, halt signal} | implicit HTTP error response | Resolved both, semantics differ — TAC has an explicit halt signal; OAuth/DPoP stack has none, only generic auth failure | TAC: no standard protocol — RP→Agent / DPoP: implicit — RS→Agent | Feasible both, DPoP less explicit |
| 7 | Attempt rollback | explicit step, bounded by transaction's own semantics | — | TAC: Resolved (explicit spec-level step) / DPoP: **Unresolved — no equivalent defined anywhere in RFC 7009, RFC 9449, or RFC 7662** | TAC: no standard protocol — RP self / DPoP: none | Not characterizable — bespoke design required, not an extension |

---

## 5. Side-by-Side Dimension Comparison

| Dimension | TAC | DPoP (Auth-Code) | Ref |
|---|---|---|---|
| Token theft/replay prevention | N/A — tokenless (TAC Proposal §11) | Core purpose of DPoP itself | 4.2 |
| Human presence at grant (provenance) | Structural — grant only reaches active status as output of a passkey ceremony | Structural *if* the `delegation` claim extension is built — non-standard | 4.1 rows 14, 19, 22 |
| User-signed scope | Yes | No — no negotiation step in this variant; scope comes from ordinary OAuth policy | 4.1 rows 3–5, 23 |
| User-signed duration | Yes | No — same as scope | 4.1 rows 3–5, 23 |
| Assurance-level binding | Structural — declared credential field, checked at issuance | Not available — accepted limitation | 4.1 row 21 |
| Agent identity attestation | User-signed key naming | New AS-side check — requires non-standard AS/WebAuthn-RP integration | 4.1 rows 14, 19 |
| Revocation initiation | User calls RP directly — same entity throughout | Blocked as specified — User never holds the token RFC 7009 requires the caller to present | 4.3 row 1 |
| Revocation synchronicity | Structural — checked every transaction | Requires optional RFC 7662 introspection; not default | 4.3 rows 4–5 |
| Rollback on revoke | Explicit spec-level step | Undefined — absent from RFC 7009/9449/7662 entirely | 4.3 row 7 |
| New protocol surface required | No modification to any standards-conformant external interface — remaining new channels (User↔RP negotiation, User↔Agent handoff) are proprietary to this deployment and never claimed interoperability with unrelated implementations | Modifies the external contract of a standards-conformant interface: the AS token endpoint (RFC 6749/9449) gains a mandatory non-standard claim, changing what any compliant client is expected to send — plus new AS/WebAuthn-RP integration and an unresolved revocation-caller mechanism | 4.1, 4.3 |
| Behavioral divergence within scope | Unsolved — not claimed as solved | Unsolved — same limitation | Section 3 |
| Transaction-phase standardness | N/A | Fully standard RFC 9449, zero modifications | 4.2 |

---

## 6. Open Design Choices

Six items, presented as choices requiring a decision — not blockers to the analysis above.

1. **WebAuthn ceremony conformance for digest-signing.** Both TAC and DPoP sign a locally-computed digest as the WebAuthn challenge, with no server round-trip at that step. Whether this satisfies WebAuthn ceremony semantics as specified, or needs a formal extension, is unresolved — shared by both designs equally, not a point of difference between them.

2. **Assurance-level-to-scope policy.** TAC ties scope to `assuranceLevel` by design, but how that mapping is determined — RP/User negotiation per grant, or a fixed policy table — is still open. This is TAC's own unresolved design surface, independent of the DPoP comparison.

3. **Behavior when a task outlives its signed duration window.** Neither design specifies whether this triggers re-negotiation or a hard stop. Open for both.

4. **Shape of the `delegation` claim's path into a standard grant type.** Two directions named (a new grant type, or JWT-wrapping to fit RFC 7523) — neither specified. RFC 7591 (Dynamic Client Registration) is a candidate for the Agent's own registration prerequisite, but doesn't independently resolve the grant-type question.

5. **DPoP's Transaction-phase freshness baseline.** Bare (`iat`/`jti` only) or extended with RFC 9449 §9 server-nonce mode — a deployment choice with real security implications (§11.2's pre-generation exposure), not yet made either way.

6. **Mechanism for User-initiated revocation.** The deepest open item: RFC 7009 assumes the caller holds the token; User does not, in this design. Closing this requires a genuinely new mechanism, not an extension of an existing one — flagged as the least trivial of the open items, not glossed over.

---

## 7. Appendix: Assertion-Based DPoP-Extended Variant

Preserved here for completeness. This variant takes a different path than the Authorization Code Grant variant used in the main body: rather than keeping RFC 6749's standard grant type intact and adding a proof-carried claim, it replaces the grant type entirely — the Agent presents a WebAuthn assertion directly to the token endpoint. It requires more new protocol surface than the Auth-Code variant and is not the recommended path, but several of its findings (the revocation caller-identity gap, the AS/WebAuthn-RP integration requirement) were found here first and confirmed to apply generally to DPoP-extended regardless of grant type — which is why it's kept rather than discarded.

**Disclaimer:** this variant was set aside in favor of the Authorization Code Grant approach before the later rounds of refinement applied to TAC and to that preferred variant elsewhere in this document. It has not received the same level of scrutiny since being deprioritized, and may not reflect subsequent corrections or improvements made to the shared understanding of TAC. Treat the material below as a preserved snapshot, not a fully current analysis — it would need a further review pass to confirm it holds up to the same standard as the rest of this document before being relied upon.

![TAC Grant](diagrams/tac_grant.png)

![DPoP Grant (Assertion-Based)](diagrams/dpop_grant.png)

### Grant Phase

| # | Step | TAC data elements | DPoP-extended data elements | Design Status | Protocol / Role | Feasibility Check |
|---|---|---|---|---|---|---|
| 1 | Authenticate via passkey | WebAuthn assertion {clientDataJSON, authenticatorData(UP/UV), signature} — UP/UV flags are the source of `assuranceLevel`, used downstream at steps 4, 11, 24 | Same | Resolved | WebAuthn/FIDO2 — User(Authenticator)→RP | Feasible, standard |
| 2 | Auth success | status only, plus `assuranceLevel` derived from step 1's UP/UV flags | status only | Resolved | HTTP/session — RP→User | Feasible |
| 3 | Propose scope+duration | {proposed scope, duration} | N/A | Resolved (TAC-only) | No standard protocol — User→RP | Feasible, informal |
| 4 | Agree scope+duration, issue nonce | {agreed scope, duration, nonce} | N/A | Resolved (TAC-only) | No standard protocol — RP→User | Feasible, informal |
| 5 | Persist pending record | {User pubkey ref, scope, duration, nonce, pending} | N/A | Resolved (TAC-only) | Internal — RP self | Feasible |
| 6 | Inform Agent of terms | {RP id, scope, duration} | N/A | Resolved (TAC-only) | No named protocol — User→Agent | Feasible; channel unspecified |
| 7 | User requests to authorize Agent | N/A | {intent signal} | Requires a new RP-exposed endpoint, not defined by RFC 6749/9449. Substitutes for the missing link a browser-redirect OAuth client gets implicitly (User present in the same flow); an autonomous Agent has none. | No standard protocol — User→RP | Feasible, but needs a new endpoint on RP/passkey server |
| 8 | RP issues nonce, persists pending | N/A | {nonce, session ref, pending} | Same new-endpoint requirement as step 7; nonce issuance plays the same replay-protection role TAC's step 4 plays, relocated since this branch has no negotiation step to bundle it with | No standard protocol — RP→User/self | Feasible, but needs a new endpoint on RP/passkey server |
| 9 | Generate keypair | {Agent pubkey, private key (local)} | Same | Resolved | WebCrypto/local — Agent self | Feasible, no constraint |
| 10 | Present Agent pubkey | {Agent pubkey} | Same | Resolved | No named protocol — Agent→User | Feasible, channel unspecified |
| 11 | Assemble credential/digest | {Identity, Scope, Temporal, assuranceLevel, Integrity[nonce]} | {Agent pubkey, RP id, nonce, assuranceLevel (extension, for TAC parity)} | TAC: Resolved / DPoP: Proposed extension (open) | W3C VC (TAC) / ad hoc (DPoP) — User self | Feasible (local assembly), both |
| 12 | Sign — 2nd ceremony, challenge=digest | WebAuthn assertion #2 over digest | Same | Open — Open Question #1: does "challenge = credential digest, no server round-trip" satisfy WebAuthn ceremony semantics as specified? Applies identically to both branches. | WebAuthn — User(Authenticator), RP origin context | Constrained — must run in RP's origin, in User's browser; not headless/Agent-executable |
| 13 | Deliver signed artifact to Agent | signed VC | signed WebAuthn assertion bundle | Resolved | No named protocol — User→Agent | Feasible, channel unspecified |
| 14 | Agent Holder-signs | Agent sig over credential | N/A | Resolved, terminology note (VP vs. credential) | W3C VC (VP convention) — Agent self | Feasible |
| 15 | Agent generates DPoP proof | N/A | {htm, htu, iat, jti, jwk} | Resolved — standard | RFC 9449 — Agent self | Feasible |
| 16 | Agent presents credential to RP | full signed VC | N/A | Resolved | HTTPS/W3C VC — Agent(Holder)→RP(Verifier) | Feasible |
| 17 | Token request | N/A | {grant_type=?, assertion, DPoP proof} | Blocked (prerequisite) — no standard grant type accepts a WebAuthn assertion. RFC 7591 (Dynamic Client Registration) is a candidate path for Agent registration but doesn't independently close the grant-type gap. | RFC 6749+ext+RFC 9449 — Agent(Client)→RP(AS) | Blocked — RFC 6749 §2 requires client registration; Agent has none |
| 18 | RP looks up User pubkey | — | N/A | Resolved (TAC-only) | FIDO2 credential store — RP self | Feasible, assumes existing store — same underlying capability RP already needed for step 1's passkey ceremony, not a new requirement. See row 19 for why the DPoP-side equivalent is costed differently despite this symmetry. |
| 19 | RP validates assertion sig | N/A | vs. User pubkey | Requires non-standard AS/WebAuthn-RP integration — mechanism is well-specified in isolation, the integration point at the AS is not. Not a capability asymmetry versus row 18 (both already needed WebAuthn verification for step 1), regardless of whether AS and RP share a backend. The asymmetry is that the AS's token endpoint presents itself as standards-conformant (RFC 6749/9449); adding a mandatory non-standard claim changes its external contract. TAC's RP endpoints never claimed that conformance. | WebAuthn verification embedded in AS — RP self | Requires AS+WebAuthn-RP component coupling — not a standard AS capability |
| 20 | RP validates sigs+terms+nonce | vs. pending record | N/A | Resolved (TAC-only) | Internal+WebAuthn+VC — RP self | Feasible |
| 21 | RP validates nonce, consumes | N/A | vs. pending record | Resolved | Internal — RP self | Feasible |
| 22 | RP validates DPoP proof sig | N/A | vs. Agent pubkey | Resolved — standard RFC 9449 | RFC 9449 §4.3 (proof-checking rules; §5 covers the token-request context they apply within) — RP(AS) self | Feasible |
| 23 | RP confirms Agent pubkey binding | N/A | digest pubkey = proof pubkey | Proposed extension (open) — new AS-side check | No standard protocol — RP self | Feasible to implement |
| 24 | RP confirms assuranceLevel | vs. negotiation | N/A | Resolved (field comparison) | Internal — RP self | Feasible |
| 25 | RP confirms assuranceLevel | N/A | No defined comparison target — this branch has no negotiation step establishing an "agreed" assuranceLevel to check against | Proposed extension (open), dependent on step 11 | Internal — RP self | Not feasible as specified; requires an added negotiation step or a policy-table lookup |
| 26 | RP updates record → active | — | N/A | Resolved (TAC-only) | Internal — RP self | Feasible |
| 27 | RP determines scope+TTL | bound to assuranceLevel by design (TAC Proposal §2) | per AS policy/client registration only | Parity gap vs. TAC — assuranceLevel verified but not enforced into scope/TTL | RFC 6749 policy — RP self | Depends on step 17's registration gap |
| 28 | Issue token | N/A | {scope, exp, cnf.jkt} | Resolved — standard RFC 9449, contingent on 17/23 | RFC 6749 §5+RFC 9449 — RP(AS)→Agent | Feasible once prerequisites resolved |
| 29 | Token response | N/A | — | Resolved | RFC 6749 §5 — RP(AS)→Agent | Feasible |
| 30 | Grant acknowledged | — | — | Resolved/optional | No standard protocol — RP→User | Feasible, optional |

### Transaction Phase

TAC keeps a server-controlled challenge-response as primary; an optional DPoP-style simplification exists but is not adopted, since it inherits DPoP's known pre-generation/replay exposure (RFC 9449 §11.2) unless §9 server-nonce mode is also adopted. DPoP's proof (row 7 below) is generated before the request is sent (row 1), not after — row numbers here align each step with its TAC counterpart for comparison rather than reflecting DPoP's own execution order.

| # | Step | TAC data elements | DPoP data elements | Design Status | Protocol / Role | Feasibility Check |
|---|---|---|---|---|---|---|
| 1 | Request transaction | bare request | request bundled with {Authorization: DPoP token, DPoP: proof} — proof generated at row 7, before this request is sent | Resolved, content differs | TAC: no standard protocol, Agent→RP / DPoP: RFC 9449, Agent→RS | Feasible both, standard for DPoP |
| 2 | Check persisted record (active/in-scope/in-window) | — | N/A | Resolved (TAC-only) — structural, synchronous revocation | Internal — RP self | Feasible |
| 3 | Issue fresh challenge | — | N/A | Resolved (TAC-only, primary path). Optional simplification available: skip rows 3–5, have Agent proactively generate a proof instead (row 7's mechanism) — not adopted as primary, per the pre-generation exposure noted above. | No standard protocol — RP→Agent | Feasible |
| 4 | Sign challenge with private key | — | N/A | Resolved (TAC-only, primary path) | WebCrypto/local — Agent self (not WebAuthn; Agent has no authenticator role) | Feasible |
| 5 | Respond to challenge | — | N/A | Resolved (TAC-only, primary path) | No standard protocol — Agent→RP | Feasible |
| 6 | Validate token (sig/exp/scope from claims) | N/A | — | Resolved — standard. Parity gap vs. TAC: checks token's own claims only, not live revocation status; synchronous revocation requires an optional RFC 7662 introspection call. | RFC 6749/9449 — RS self | Feasible, standard |
| 7 | Agent generates DPoP proof (proactive) | N/A | {htm, htu, iat, jti, ath} | Resolved — standard. Chronologically occurs before/concurrent with row 1, not after row 6. | RFC 9449 — Agent self | Feasible, standard; no round trip |
| 8 | Validate DPoP proof (sig vs. `cnf.jkt`, freshness, replay) | N/A | — | Resolved — standard. Baseline uses bare `iat`/`jti` freshness only unless §9 server-nonce mode is separately adopted — not yet decided either way. | RFC 9449 §7.1 (directs RS to check per §4.3, confirm key binding per §6) — RS self | Feasible, standard |
| 9 | Validate signature + freshness | — | N/A | Resolved (TAC-only, primary path) | Internal — RP self | Feasible |
| 10 | Transaction permitted | — | N/A | Resolved (TAC-only, explicit step); DPoP folds permit into execute, no separate message | No standard protocol — RP→Agent | Feasible, optional (UX) |
| 10a | (RP-internal) Obtain/mint OAuth access token for RP's own API | RFC 6749 (client-credentials or internal pattern) — RP self; not exposed to Agent, TAC stays token-free at the Agent boundary | N/A — Agent's own token already serves this purpose | Architecture-dependent, optional — completes TAC Proposal §11's stated OAuth relationship | RFC 6749 §4.4 — RP self | Feasible where applicable |
| 11 | Execute transaction | — | — | Resolved, shared | Internal — RP/RS self | Feasible both |

### Revocation Phase

TAC's revocation check happens at the same entity that processed the revocation. DPoP's is processed at the AS but checked at the RS — a different entity — so synchronicity depends on optional introspection. A more fundamental issue precedes that: row 1 establishes User cannot initiate revocation as specified, since User never holds the token in this Grant design (this finding is common to both DPoP-extended variants, not specific to either grant type).

| # | Step | TAC data elements | DPoP data elements | Design Status | Protocol / Role | Feasibility Check |
|---|---|---|---|---|---|---|
| 1 | Call revocation endpoint | {revocation request} | {token to be revoked} | TAC: Resolved / DPoP: Blocked (caller undefined) — RFC 7009 §2.1 requires the caller to present the token or be the authenticated client; the token is Agent-only, User has neither. | TAC: no standard protocol — User→RP / DPoP: RFC 7009 §2.1 — caller undetermined | TAC: Feasible / DPoP: Not feasible as specified |
| 2 | Mark/flip status to revoked | persisted record status = revoked | AS-side token invalidation record | Resolved both, synchronous at the authority — scope differs | TAC: internal — RP self / DPoP: RFC 7009 §2.1 — AS self | Feasible both |
| 3 | Attempt transaction (in-flight or new) | — | token + DPoP proof presented | Resolved. Critical structural difference: TAC's RP is the same entity that processed revocation; DPoP's RS is a different entity from the AS that processed it. | TAC: no standard protocol — Agent→RP / DPoP: RFC 9449 — Agent→RS | Feasible both |
| 4 | Check status | direct persisted-record lookup, same entity/store as row 2 | validates token's own local claims (sig, exp) only | TAC: Resolved / DPoP: Parity gap vs. TAC — does not see AS-side revocation by default | TAC: internal — RP self / DPoP: RFC 9449 local validation — RS self | Feasible; DPoP incomplete without row 5 |
| 5 | RS queries AS for current status | N/A | introspection request/response | Proposed extension (open) — required to close row 4's parity gap | RFC 7662 — RS→AS | Feasible; adds latency + AS dependency per transaction |
| 6 | Deny + signal | explicit {deny, halt signal} | implicit HTTP error response | Resolved both, semantics differ — TAC has an explicit halt signal; OAuth/DPoP stack has none | TAC: no standard protocol — RP→Agent / DPoP: implicit — RS→Agent | Feasible both, DPoP less explicit |
| 7 | Attempt rollback | explicit step, bounded by transaction's own semantics | — | TAC: Resolved (explicit spec-level step) / DPoP: Unresolved — no equivalent defined anywhere in RFC 7009, RFC 9449, or RFC 7662 | TAC: no standard protocol — RP self / DPoP: none | Not characterizable — bespoke design required |
