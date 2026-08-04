import { createRequire } from "node:module";
import type { CanonicalDigestInput } from "./credential.js";

// `canonicalize`'s bundled .d.ts declares an ESM-shaped `export default`, but the package is
// actually plain CommonJS (`module.exports = fn`) with no matching `.default` wrapper at
// runtime — a mismatch that makes a normal `import canonicalize from "canonicalize"` fail to
// typecheck even though it would work at runtime. Using `createRequire` sidesteps the faulty
// type declaration rather than fighting it.
const require = createRequire(import.meta.url);
const canonicalize = require("canonicalize") as (input: unknown) => string | undefined;

/** Single source of truth for FR-021 (resolves OQ-6): RFC 8785 (JCS) serialization of exactly
 * `{identity, scope, temporal, assuranceLevel, grantNonce}`, hashed with SHA-256, and used as
 * the WebAuthn challenge for ceremony two. Used identically by user-client (signing side) and
 * rp-server (verification side) — see specs/001-grant/data-model.md "Digest computation".
 *
 * Uses the Web Crypto API (`crypto.subtle`), available natively in both Node 20+ and browsers,
 * so this function needs no environment-specific branching.
 */
export async function computeCredentialDigest(input: CanonicalDigestInput): Promise<Uint8Array> {
  const canonicalSubset = {
    identity: input.identity,
    scope: input.scope,
    temporal: input.temporal,
    assuranceLevel: input.assuranceLevel,
    grantNonce: input.grantNonce,
  };
  const canonicalJson = canonicalize(canonicalSubset);
  if (canonicalJson === undefined) {
    throw new Error("Credential content could not be JCS-canonicalized (contains undefined?)");
  }
  const bytes = new TextEncoder().encode(canonicalJson);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

export function bufferToBase64url(buf: Uint8Array): string {
  let bin = "";
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToBuffer(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}
