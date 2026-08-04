import { computeTransactionSignatureBytes, base64urlToBuffer } from "@tac/shared";
import { GrantRecordStore } from "../models/grant-record-store.js";
import { AgentKeyStore } from "../models/agent-key-store.js";
import { TransactionChallengeStore } from "../models/transaction-challenge-store.js";

const CHALLENGE_WINDOW_SECONDS_DEFAULT = 60; // spec.md Assumptions: short-lived by design, POC-reasonable default

export interface TransactionRequest {
  grantNonce: string;
  txType: string;
  amount: number;
}

export interface TransactionRequestSuccess {
  challengeId: string;
  challenge: string;
  expiresAt: string;
}

export type TransactionGateRejectionReason = "grant_not_active" | "grant_out_of_window" | "grant_out_of_scope";

export type TransactionRequestOutcome =
  | { ok: true; result: TransactionRequestSuccess }
  | { ok: false; reason: TransactionGateRejectionReason };

export interface TransactionRespondRequest {
  challengeId: string;
  signature: string;
}

export type TransactionRespondRejectionReason =
  | "challenge_not_found"
  | "challenge_expired"
  | "grant_not_active"
  | "grant_out_of_window"
  | "invalid_signature";

export type TransactionRespondOutcome =
  | { ok: true; grantNonce: string; challengeId: string }
  | { ok: false; reason: TransactionRespondRejectionReason };

/** The scope block's runtime shape (FR-004, data-model.md "Grant Record" scope interpretation)
 * — `GrantRecord.agreedScope` is opaque at the type level (`Record<string, unknown>`), but this
 * feature interprets it structurally as `{txTypes, maxAmount}`, matching the shape 001-grant's
 * own demo scripts and tests already established as example content. */
interface TransactionScope {
  txTypes: string[];
  maxAmount: number;
}

function isInScope(scope: unknown, txType: string, amount: number): boolean {
  const s = scope as Partial<TransactionScope> | null | undefined;
  if (!s || !Array.isArray(s.txTypes) || typeof s.maxAmount !== "number") return false;
  return s.txTypes.includes(txType) && amount <= s.maxAmount;
}

/** Implements FR-001 through FR-012: the transaction-time challenge-response flow. Grant-state
 * checks (FR-002/FR-003/FR-004) gate challenge issuance (FR-005) in `request()`; the challenge is
 * retrieved-and-consumed at the START of `respond()` (FR-008, Constitution Principle V —
 * NON-NEGOTIABLE), before the Grant state is re-checked (research.md §5) and the signature is
 * verified against `AgentKeyStore`'s recorded key (FR-007) — every condition required, no single
 * passing check may permit a transaction on its own (FR-011). */
export class TransactionService {
  constructor(
    private readonly grantStore: GrantRecordStore,
    private readonly agentKeyStore: AgentKeyStore,
    private readonly challengeStore: TransactionChallengeStore,
    private readonly challengeWindowSeconds: number = CHALLENGE_WINDOW_SECONDS_DEFAULT,
  ) {}

  /** FR-001/FR-002/FR-003/FR-004/FR-005: the Grant-state gate. Any single failure denies with NO
   * challenge issued (SC-001) — an unknown/bogus `grantNonce` is denied identically to a `pending`
   * or `expired` Grant, per spec.md Edge Cases. */
  request(req: TransactionRequest): TransactionRequestOutcome {
    const gateFailure = this.evaluateGate(req.grantNonce, req.txType, req.amount);
    if (gateFailure) {
      return { ok: false, reason: gateFailure };
    }

    const challengeId = crypto.randomUUID();
    const challenge = crypto.randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.challengeWindowSeconds * 1000);

    this.challengeStore.issue({
      challengeId,
      challenge,
      grantNonce: req.grantNonce,
      txType: req.txType,
      amount: req.amount,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      consumedAt: null,
    });

    return { ok: true, result: { challengeId, challenge, expiresAt: expiresAt.toISOString() } };
  }

  /** FR-007/FR-008/FR-009/FR-011/FR-012: the challenge-response verification and permit
   * decision. `retrieveForVerification()` runs FIRST — before the Grant-state re-check or
   * signature verification — so a second presentation of the same `challengeId` is always
   * rejected regardless of what happened on the first attempt (FR-009). */
  async respond(req: TransactionRespondRequest): Promise<TransactionRespondOutcome> {
    const challenge = this.challengeStore.retrieveForVerification(req.challengeId);
    if (!challenge) {
      return { ok: false, reason: "challenge_not_found" };
    }

    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
      return { ok: false, reason: "challenge_expired" };
    }

    // research.md §5: re-run the same Grant-state gate used at request time — scope is not
    // re-checked here, since it cannot change between the two calls (the challenge is already
    // bound to the specific {txType, amount} that passed the scope check at issuance).
    const gateFailure = this.evaluateActiveAndWindow(challenge.grantNonce);
    if (gateFailure) {
      return { ok: false, reason: gateFailure };
    }

    const agentPublicKeyJwk = this.agentKeyStore.get(challenge.grantNonce);
    if (!agentPublicKeyJwk) {
      return { ok: false, reason: "invalid_signature" };
    }

    // FR-007: verify against the RP's OWN stored {challenge, txType, amount} — never anything
    // resent in the request body — so a wire-level tamper attempt invalidates the signature.
    const expectedBytes = computeTransactionSignatureBytes({
      challenge: challenge.challenge,
      txType: challenge.txType,
      amount: challenge.amount,
    });

    let verified = false;
    try {
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        agentPublicKeyJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      verified = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        base64urlToBuffer(req.signature),
        expectedBytes,
      );
    } catch {
      verified = false;
    }

    if (!verified) {
      return { ok: false, reason: "invalid_signature" };
    }

    return { ok: true, grantNonce: challenge.grantNonce, challengeId: challenge.challengeId };
  }

  private evaluateGate(
    grantNonce: string,
    txType: string,
    amount: number,
  ): TransactionGateRejectionReason | undefined {
    const activeOrWindow = this.evaluateActiveAndWindow(grantNonce);
    if (activeOrWindow) return activeOrWindow;

    const record = this.grantStore.get(grantNonce)!;
    if (!isInScope(record.agreedScope, txType, amount)) {
      return "grant_out_of_scope";
    }
    return undefined;
  }

  private evaluateActiveAndWindow(
    grantNonce: string,
  ): "grant_not_active" | "grant_out_of_window" | undefined {
    const record = this.grantStore.get(grantNonce);
    if (!record || record.status !== "active") {
      return "grant_not_active";
    }
    const now = Date.now();
    if (
      now < new Date(record.agreedDuration.validFrom).getTime() ||
      now > new Date(record.agreedDuration.validUntil).getTime()
    ) {
      return "grant_out_of_window";
    }
    return undefined;
  }
}
