import type { AuthenticatorDevice } from "@simplewebauthn/types";
import { RegisteredPasskeyStore } from "../models/registered-passkey-store.js";
import { encodeP256CoseKey } from "./cose-key.js";
import { readDemoState, writeDemoState } from "@tac/shared";

export interface SeededPasskey {
  accountId: string;
  /** Dev/demo convenience only — in a real deployment the User's private key never leaves
   * their authenticator; this POC's seed helper bypasses the out-of-scope registration
   * ceremony (spec.md precondition) by generating both halves of a keypair locally so a
   * test/demo client can sign assertions against it. */
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  credentialId: string;
}

/** Bypasses the out-of-scope passkey-registration ceremony (spec.md precondition: "a User who
 * already has a registered passkey with the RP") by directly inserting a structurally valid
 * registered credential — used by quickstart.md's Setup step.
 *
 * Accepts an optional pre-existing keypair/credentialId so the standalone `seed:passkey` CLI
 * (which persists to demo-state.json) and this process's own registration can agree on the
 * SAME credential — otherwise a separately-run demo signer would hold a private key that
 * doesn't match whatever this process generated independently. */
export async function seedDefaultPasskey(
  store: RegisteredPasskeyStore,
  accountId = "demo-user",
  existing?: { privateKeyJwk: JsonWebKey; publicKeyJwk: JsonWebKey; credentialId: string },
): Promise<SeededPasskey> {
  let publicJwk: JsonWebKey;
  let privateKeyJwk: JsonWebKey;
  let credentialID: string;

  if (existing) {
    ({ publicKeyJwk: publicJwk, privateKeyJwk, credentialId: credentialID } = existing);
  } else {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    credentialID = bytesToBase64url(crypto.getRandomValues(new Uint8Array(16)));
  }

  const x = base64urlToBytes(publicJwk.x!);
  const y = base64urlToBytes(publicJwk.y!);
  const credentialPublicKey = encodeP256CoseKey(x, y);

  const authenticator: AuthenticatorDevice = {
    credentialID,
    credentialPublicKey,
    counter: 0,
    transports: ["internal"],
  };
  store.register(accountId, authenticator, publicJwk);

  return { accountId, privateKeyJwk, publicKeyJwk: publicJwk, credentialId: credentialID };
}

/** Used by rp-server's own startup (index.ts): reuses demo-state.json's seeded passkey if
 * `npm run seed:passkey` already wrote one, so the dev server and a separately-run demo signer
 * agree on the same credential; otherwise generates a fresh one (e.g. for automated tests that
 * don't need cross-process demo continuity). */
export async function seedFromDemoStateOrFresh(
  store: RegisteredPasskeyStore,
  accountId = "demo-user",
): Promise<SeededPasskey> {
  const state = await readDemoState();
  return seedDefaultPasskey(store, accountId, state.seededPasskey);
}

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function bytesToBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// CLI entry point (`npm run seed:passkey`): generates a passkey ONCE and persists it to
// demo-state.json so both the dev server (via seedFromDemoStateOrFresh) and the demo's
// software-authenticator signer (a separate process) can agree on the same credential.
if (import.meta.url === `file://${process.argv[1]}`) {
  const store = new RegisteredPasskeyStore();
  const seeded = await seedDefaultPasskey(store);
  await writeDemoState({ seededPasskey: seeded });
  console.log(JSON.stringify(seeded, null, 2));
}
