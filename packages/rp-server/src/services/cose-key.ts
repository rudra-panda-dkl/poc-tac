import { encodeCBOR } from "@levischuck/tiny-cbor";

/** Encodes a raw EC P-256 (x, y) public key point as a COSE_Key (RFC 9053 §7.1, EC2/ES256) —
 * the format WebAuthn stores `credentialPublicKey` in. Only used by the local dev seed helper
 * (T013) to construct a structurally valid `AuthenticatorDevice` without running a live
 * registration ceremony; production credential verification always goes through
 * @simplewebauthn/server's own decode path from a real attestationObject. */
export function encodeP256CoseKey(x: Uint8Array, y: Uint8Array): Uint8Array {
  const coseKey = new Map<number, number | Uint8Array>([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, x],
    [-3, y],
  ]);
  return encodeCBOR(coseKey);
}
