import { bufferToBase64url } from "@tac/shared";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";

/** Demo/test-only "software authenticator": constructs a real, verifiable WebAuthn
 * AuthenticationResponseJSON by signing with a CryptoKey held in this process, instead of
 * driving an actual browser + hardware/platform authenticator.
 *
 * This is NOT what tasks.md T006 validates — T006's question was whether a real browser's
 * WebAuthn API accepts a locally-computed, non-server-fetched challenge at all (an API/spec
 * conformance question that requires a real browser engine, see specs/001-grant/research.md
 * §1). This helper answers a different, narrower need: demoing/testing the REST of the
 * protocol (negotiation, credential assembly, digest computation, RP-side validation) without
 * requiring a live browser + a private key that only a real authenticator could hold. Since
 * rp-server's seed helper (T013) already fabricates both halves of a keypair for this POC
 * (spec.md's registration precondition is out of scope), signing here with that same
 * fabricated private key produces a genuinely valid, @simplewebauthn/server-verifiable
 * assertion — just not one that proves anything about real authenticator/browser behavior.
 */
export interface SoftwareAuthenticatorParams {
  privateKey: CryptoKey; // ECDSA P-256, from crypto.subtle.importKey of the seeded JWK
  credentialId: string; // base64url
  rpId: string;
  challenge: string; // base64url
  counter: number;
  userVerified?: boolean;
  origin?: string;
}

export interface SoftwareAssertionResult {
  assertionResponse: AuthenticationResponseJSON;
  newCounter: number;
}

export async function signSoftwareAssertion(
  params: SoftwareAuthenticatorParams,
): Promise<SoftwareAssertionResult> {
  const origin = params.origin ?? `http://${params.rpId}`;
  const clientData = {
    type: "webauthn.get",
    challenge: params.challenge,
    origin,
    crossOrigin: false,
  };
  const clientDataJSON = JSON.stringify(clientData);
  const clientDataHash: Uint8Array<ArrayBuffer> = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientDataJSON)),
  );

  const rpIdHash: Uint8Array<ArrayBuffer> = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(params.rpId)),
  );
  const newCounter = params.counter + 1;
  const flags = 0x01 | (params.userVerified ? 0x04 : 0x00); // UP always set; UV per param
  const counterBytes = new Uint8Array(4);
  new DataView(counterBytes.buffer).setUint32(0, newCounter, false);
  const authenticatorData = concatBytes(rpIdHash, new Uint8Array([flags]), counterBytes);

  const signedData = concatBytes(authenticatorData, clientDataHash);
  const signature: Uint8Array<ArrayBuffer> = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, params.privateKey, signedData),
  );
  const derSignature = ecdsaRawToDer(signature);

  const assertionResponse: AuthenticationResponseJSON = {
    id: params.credentialId,
    rawId: params.credentialId,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: bufferToBase64url(new TextEncoder().encode(clientDataJSON)),
      authenticatorData: bufferToBase64url(authenticatorData),
      signature: bufferToBase64url(derSignature),
    },
  };

  return { assertionResponse, newCounter };
}

function concatBytes(...arrays: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** WebCrypto's ECDSA signatures are raw (r || s, 32 bytes each for P-256); WebAuthn/CBOR
 * signatures are DER-encoded. Converts one to the other. */
function ecdsaRawToDer(raw: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const r = trimLeadingZeros(raw.slice(0, 32));
  const s = trimLeadingZeros(raw.slice(32, 64));
  const rEncoded = derInteger(r);
  const sEncoded = derInteger(s);
  const body = concatBytes(rEncoded, sEncoded);
  return concatBytes(new Uint8Array([0x30, body.length]), body);
}

function trimLeadingZeros(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  const trimmed = bytes.slice(i);
  // DER integers are signed — prepend 0x00 if the high bit is set, so it isn't read as negative.
  if (trimmed[0] & 0x80) {
    const padded = new Uint8Array(trimmed.length + 1);
    padded.set(trimmed, 1);
    return padded;
  }
  return trimmed;
}

function derInteger(value: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  return concatBytes(new Uint8Array([0x02, value.length]), value);
}
