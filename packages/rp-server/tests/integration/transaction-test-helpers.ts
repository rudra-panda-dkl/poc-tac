import type { AssuranceLevel, CredentialScope, GrantRecordStatus } from "@tac/shared";
// Cross-package devDependency (rp-server -> @tac/agent-client, tests-only) — reuses the real
// Agent keypair generation and transaction-response signing rather than re-implementing WebCrypto
// ECDSA a second time for tests, mirroring test-helpers.ts's existing use of
// @tac/user-client/dist/demo/software-authenticator.js.
import {
  getOrCreateAgentKeypair,
  type AgentKeypair,
} from "@tac/agent-client/dist/keypair/generate-keypair.js";
import { GrantRecordStore } from "../../src/models/grant-record-store.js";
import { AgentKeyStore } from "../../src/models/agent-key-store.js";
import { TransactionChallengeStore } from "../../src/models/transaction-challenge-store.js";
import { TransactionService } from "../../src/services/transaction-service.js";
import { RP_ID } from "../../src/services/webauthn.js";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  type TestRpContext,
} from "./test-helpers.js";

export interface ActiveTestGrant {
  ctx: TestRpContext;
  transactionService: TransactionService;
  challengeStore: TransactionChallengeStore;
  grantNonce: string;
  agentKeypair: AgentKeypair;
}

/** Drives 001-grant's full negotiate -> activate flow (reusing test-helpers.ts) using a REAL
 * `@tac/agent-client` keypair — not just a random test key — so 002-transact's tests exercise
 * the actual `AgentKeyStore` entry `CredentialValidationService.activate()` records, and can
 * produce genuine, verifiable ECDSA signatures via `signTransactionResponse()` against it. */
export async function activateTestGrant(
  scope: CredentialScope,
  duration: { validFrom: string; validUntil: string },
  challengeWindowSeconds?: number,
): Promise<ActiveTestGrant> {
  const ctx = await setupTestRp();
  const agentKeypair = await getOrCreateAgentKeypair(RP_ID);

  const { outcome: negotiateOutcome, newCounter } = await performCeremonyOne(ctx, scope, duration, 0);
  if (!negotiateOutcome.ok) {
    throw new Error(`test setup: negotiate failed (${negotiateOutcome.reason})`);
  }

  const { credential } = await signTestCredential(
    ctx,
    agentKeypair.publicKeyJwk,
    {
      rpIdentifier: negotiateOutcome.result.rpIdentifier,
      scope: negotiateOutcome.result.agreedScope,
      temporal: negotiateOutcome.result.agreedDuration,
      assuranceLevel: negotiateOutcome.result.assuranceLevel,
      grantNonce: negotiateOutcome.result.nonce,
    },
    newCounter,
  );

  const activation = await ctx.validationService.activate(credential);
  if (!activation.ok) {
    throw new Error(`test setup: activate failed (${activation.reason})`);
  }

  const challengeStore = new TransactionChallengeStore();
  const transactionService = new TransactionService(
    ctx.grantStore,
    ctx.agentKeyStore,
    challengeStore,
    challengeWindowSeconds,
  );

  return { ctx, transactionService, challengeStore, grantNonce: negotiateOutcome.result.nonce, agentKeypair };
}

export interface DirectTestGrant {
  grantStore: GrantRecordStore;
  agentKeyStore: AgentKeyStore;
  transactionService: TransactionService;
  challengeStore: TransactionChallengeStore;
  grantNonce: string;
  agentKeypair: AgentKeypair;
}

/** Seeds a Grant Record directly into a fresh `GrantRecordStore`, bypassing 001-grant's full
 * negotiate/activate ceremony entirely — matches spec.md User Story 2/3's own Independent Test
 * wording ("Seed Grant Records in each denial-worthy state in turn" / "seed a pending Grant
 * Record directly"). Still registers a real `@tac/agent-client` keypair in `AgentKeyStore` for
 * the seeded nonce, so respond-time signature tests can produce a genuine, independently-signed
 * response and distinguish "signature invalid" from "no key on file". */
export async function seedGrantRecord(
  overrides: {
    status: GrantRecordStatus;
    agreedScope: CredentialScope;
    agreedDuration: { validFrom: string; validUntil: string };
    assuranceLevel?: AssuranceLevel;
  },
  challengeWindowSeconds?: number,
): Promise<DirectTestGrant> {
  const grantStore = new GrantRecordStore();
  const agentKeyStore = new AgentKeyStore();
  const challengeStore = new TransactionChallengeStore();
  const transactionService = new TransactionService(grantStore, agentKeyStore, challengeStore, challengeWindowSeconds);

  const grantNonce = crypto.randomUUID();
  const agentKeypair = await getOrCreateAgentKeypair(`seed-${crypto.randomUUID()}`);
  const now = new Date().toISOString();

  grantStore.createPending({
    nonce: grantNonce,
    userPublicKeyRef: "seed-test-user",
    agreedScope: overrides.agreedScope,
    agreedDuration: overrides.agreedDuration,
    assuranceLevel: overrides.assuranceLevel ?? "UP+UV",
    nonceIssuedAt: now,
    nonceExpiresAt: now,
    status: overrides.status,
    consumedAt: null,
  });
  agentKeyStore.record(grantNonce, agentKeypair.publicKeyJwk);

  return { grantStore, agentKeyStore, transactionService, challengeStore, grantNonce, agentKeypair };
}
