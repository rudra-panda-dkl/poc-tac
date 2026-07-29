// Phase 0/Constitution Principle II conformance spike (tasks.md T006).
//
// Question: can ceremony two's WebAuthn assertion use a challenge computed entirely
// client-side (the JCS digest of the assembled credential), with NO fresh server round-trip
// between ceremony one and ceremony two (FR-004)? This drives a real Chromium WebAuthn
// implementation via a CDP virtual authenticator (no physical hardware or human presence
// required — Chrome's WebAuthn.addVirtualAuthenticator automates presence/verification) to
// find out empirically, per research.md §1's mandate to validate against real browser
// behavior rather than spec-reading alone.
//
// Residual scope note: this validates the *browser's* WebAuthn API behavior. It does not
// validate every physical hardware authenticator's firmware quirks — that residual risk is
// smaller and not blocking for this POC, but is worth flagging if a real hardware key is
// available for a follow-up spot-check.

import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4173;

function findChromiumExecutable() {
  const cacheRoot = path.join(process.env.HOME, "Library/Caches/ms-playwright");
  const out = execSync(`find "${cacheRoot}" -type f -name "Chromium" -path "*MacOS*"`, {
    encoding: "utf8",
  }).trim();
  const first = out.split("\n")[0];
  if (!first) throw new Error("Could not locate downloaded Chromium executable");
  return first;
}

async function main() {
  const server = createServer(async (req, res) => {
    const html = await readFile(path.join(__dirname, "page.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  const executablePath = findChromiumExecutable();
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);

  const result = { steps: [], pass: false };

  try {
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    result.steps.push({ step: "add-virtual-authenticator", ok: true, authenticatorId });

    await page.goto(`http://localhost:${PORT}/page.html`);

    // Ceremony-one stand-in: the out-of-scope registration precondition.
    const credentialId = await page.evaluate(() => window.__registerPrecondition());
    result.steps.push({ step: "register-precondition", ok: true, credentialId });

    // Client-side-only JCS-style digest computation — no network call — feeding directly
    // into ceremony two's challenge. This is the exact mechanism research.md §1 proposes.
    const digestB64url = await page.evaluate(async () => {
      const sample = {
        assuranceLevel: "UP+UV",
        grantNonce: "spike-nonce-abc123",
        identity: { agentPublicKey: "stub", rpIdentifier: "localhost", userPublicKey: "stub" },
        scope: { txTypes: ["demo"] },
        temporal: { validFrom: "2026-07-22T00:00:00Z", validUntil: "2026-07-22T00:30:00Z" },
      };
      const canonical = JSON.stringify(sample, Object.keys(sample).sort());
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
      let bin = "";
      new Uint8Array(digest).forEach((b) => (bin += String.fromCharCode(b)));
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    });
    result.steps.push({ step: "compute-digest-no-roundtrip", ok: true, digestB64url });

    // Ceremony two: the assertion whose challenge IS the locally-computed digest, with zero
    // network calls between ceremony one (registration, above) and this call.
    const assertionResult = await page.evaluate(
      ([credId, digest]) => window.__ceremonyTwo(credId, digest),
      [credentialId, digestB64url],
    );
    result.steps.push({ step: "ceremony-two-assertion", ok: true, assertionResult });

    const challengeRoundTripsCorrectly =
      assertionResult.clientDataJSON.challenge === digestB64url;
    const typeIsWebauthnGet = assertionResult.clientDataJSON.type === "webauthn.get";

    result.pass = challengeRoundTripsCorrectly && typeIsWebauthnGet;
    result.checks = { challengeRoundTripsCorrectly, typeIsWebauthnGet };
  } catch (err) {
    result.error = String(err && err.stack ? err.stack : err);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
}

main();
