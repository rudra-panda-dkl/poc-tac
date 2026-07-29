# WebAuthn Conformance Spike (tasks.md T006)

Validates, against a real Chromium WebAuthn implementation, whether ceremony two can use a
challenge computed entirely client-side (no fresh server round-trip) — the mechanism
`specs/001-grant/research.md` §1 proposes for FR-004. See that section for the recorded outcome.

## Run it yourself

```bash
cd spikes/001-grant-webauthn-conformance
npx playwright@1.47.0 install chromium   # one-time, if not already cached
node run-spike.mjs
```

Exits 0 and prints a JSON result with `"pass": true` on success. Uses a CDP-driven virtual
authenticator (`WebAuthn.addVirtualAuthenticator`) — no physical security key or human presence
required.

This is a standalone artifact, deliberately not part of the `packages/*` npm workspace — it
exists to validate the ceremony-two mechanism, not to ship as part of the feature itself.
