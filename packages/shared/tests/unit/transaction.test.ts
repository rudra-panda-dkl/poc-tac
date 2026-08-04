import { describe, it, expect } from "vitest";
import { computeTransactionSignatureBytes } from "../../src/transaction.js";
import { bufferToBase64url } from "../../src/canonicalize.js";

const basePayload = { challenge: "chal-1", txType: "transfer", amount: 100 };

describe("computeTransactionSignatureBytes (FR-007)", () => {
  it("is deterministic for the same logical content", () => {
    const b1 = computeTransactionSignatureBytes(basePayload);
    const b2 = computeTransactionSignatureBytes(structuredClone(basePayload));
    expect(bufferToBase64url(b1)).toBe(bufferToBase64url(b2));
  });

  it("is invariant to key ordering (JCS sorts object keys)", () => {
    const reordered = { amount: basePayload.amount, challenge: basePayload.challenge, txType: basePayload.txType };
    const b1 = computeTransactionSignatureBytes(basePayload);
    const b2 = computeTransactionSignatureBytes(reordered);
    expect(bufferToBase64url(b1)).toBe(bufferToBase64url(b2));
  });

  it("produces different bytes when the challenge changes", () => {
    const changed = { ...basePayload, challenge: "chal-2" };
    const b1 = computeTransactionSignatureBytes(basePayload);
    const b2 = computeTransactionSignatureBytes(changed);
    expect(bufferToBase64url(b1)).not.toBe(bufferToBase64url(b2));
  });

  it("produces different bytes when txType changes", () => {
    const changed = { ...basePayload, txType: "withdraw" };
    const b1 = computeTransactionSignatureBytes(basePayload);
    const b2 = computeTransactionSignatureBytes(changed);
    expect(bufferToBase64url(b1)).not.toBe(bufferToBase64url(b2));
  });

  it("produces different bytes when amount changes", () => {
    const changed = { ...basePayload, amount: 101 };
    const b1 = computeTransactionSignatureBytes(basePayload);
    const b2 = computeTransactionSignatureBytes(changed);
    expect(bufferToBase64url(b1)).not.toBe(bufferToBase64url(b2));
  });

  it("distinguishes -0 from 0 the way JCS/ECMA-262 requires", () => {
    const withNegZero = { ...basePayload, amount: -0 };
    const withZero = { ...basePayload, amount: 0 };
    const b1 = computeTransactionSignatureBytes(withNegZero);
    const b2 = computeTransactionSignatureBytes(withZero);
    expect(bufferToBase64url(b1)).toBe(bufferToBase64url(b2));
  });
});
