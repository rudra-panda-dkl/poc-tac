import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import type { CredentialScope, GrantRecordStatus } from "@tac/shared";
// Cross-package devDependency (rp-server -> @tac/user-client, tests-only) — reuses the same
// software authenticator negotiate/activate tests already use, rather than re-implementing
// WebAuthn assertion signing a second time.
import { signSoftwareAssertion } from "@tac/user-client/dist/demo/software-authenticator.js";
import { GrantRecordStore } from "../../src/models/grant-record-store.js";
import { RegisteredPasskeyStore } from "../../src/models/registered-passkey-store.js";
import { RevocationChallengeStore } from "../../src/models/revocation-challenge-store.js";
import { RevocationService } from "../../src/services/revocation-service.js";
import { TransactionChallengeStore } from "../../src/models/transaction-challenge-store.js";
import { TransactionService } from "../../src/services/transaction-service.js";
import { RP_ID } from "../../src/services/webauthn.js";
import {
  setupTestRp,
  performCeremonyOne,
  signTestCredential,
  generateAgentPublicKeyJwk,
  type TestRpContext,
} from "./test-helpers.js";

/** Revocation has no Agent role (spec.md Edge Cases), so — unlike
 * transaction-test-helpers.ts's activateTestGrant() — these helpers use a plain random
 * `generateAgentPublicKeyJwk()` rather than a real `@tac/agent-client` keypair: the Agent's
 * public key is inert data inside the Credential for these tests, never signed against. */

export interface RevocationTestRp {
  ctx: TestRpContext;
  revocationService: RevocationService;
  revocationChallengeStore: RevocationChallengeStore;
}

export function setupRevocationTestRp(ctx: TestRpContext, challengeWindowSeconds?: number): RevocationTestRp {
  const revocationChallengeStore = new RevocationChallengeStore();
  const revocationService = new RevocationService(
    ctx.grantStore,
    ctx.passkeyStore,
    revocationChallengeStore,
    challengeWindowSeconds,
  );
  return { ctx, revocationService, revocationChallengeStore };
}

/** Builds a `TransactionService` on the SAME `ctx.grantStore`/`ctx.agentKeyStore` a
 * `RevocationService` from `setupRevocationTestRp(ctx, ...)` also shares — this is what lets a
 * test demonstrate the actual cross-feature guarantee (FR-012): one Grant Record store, read
 * live by both services, no propagation delay between a revocation write and a transaction
 * read. */
export function buildTransactionServiceOnContext(
  ctx: TestRpContext,
  challengeWindowSeconds?: number,
): { transactionService: TransactionService; transactionChallengeStore: TransactionChallengeStore } {
  const transactionChallengeStore = new TransactionChallengeStore();
  const transactionService = new TransactionService(
    ctx.grantStore,
    ctx.agentKeyStore,
    transactionChallengeStore,
    challengeWindowSeconds,
  );
  return { transactionService, transactionChallengeStore };
}

/** Runs 001-grant's real negotiate -> activate flow against an EXISTING ctx (unlike
 * transaction-test-helpers.ts's activateTestGrant(), which always builds a fresh one) — so
 * callers can activate multiple grants sharing one RP context, needed for cross-grant
 * revocation-replay tests (User Story 2 Scenario 2). Returns the counter to feed into the next
 * ceremony against this same ctx, if any. */
export async function activateGrantOnContext(
  ctx: TestRpContext,
  scope: CredentialScope,
  duration: { validFrom: string; validUntil: string },
  counter: number,
): Promise<{ grantNonce: string; newCounter: number }> {
  const { outcome, newCounter } = await performCeremonyOne(ctx, scope, duration, counter);
  if (!outcome.ok) {
    throw new Error(`test setup: negotiate failed (${outcome.reason})`);
  }

  const agentPublicKeyJwk = await generateAgentPublicKeyJwk();
  const { credential } = await signTestCredential(
    ctx,
    agentPublicKeyJwk,
    {
      rpIdentifier: outcome.result.rpIdentifier,
      scope: outcome.result.agreedScope,
      temporal: outcome.result.agreedDuration,
      assuranceLevel: outcome.result.assuranceLevel,
      grantNonce: outcome.result.nonce,
    },
    newCounter,
  );

  const activation = await ctx.validationService.activate(credential);
  if (!activation.ok) {
    throw new Error(`test setup: activate failed (${activation.reason})`);
  }

  const authenticator = ctx.passkeyStore.getByAccountId(ctx.accountId)!;
  return { grantNonce: outcome.result.nonce, newCounter: authenticator.counter };
}

/** Convenience one-shot for the common single-grant case: fresh ctx, one active grant, a
 * RevocationService bound to it. */
export async function activateSingleGrantWithRevocation(
  scope: CredentialScope,
  duration: { validFrom: string; validUntil: string },
  challengeWindowSeconds?: number,
): Promise<RevocationTestRp & { grantNonce: string }> {
  const ctx = await setupTestRp();
  const { grantNonce } = await activateGrantOnContext(ctx, scope, duration, 0);
  const { revocationService, revocationChallengeStore } = setupRevocationTestRp(ctx, challengeWindowSeconds);
  return { ctx, revocationService, revocationChallengeStore, grantNonce };
}

/** Signs the RP-issued revocation challenge with the User's real registered-passkey private
 * key, reading the live counter off `ctx.passkeyStore` so repeated signing calls against the
 * same ctx stay monotonic. */
export async function signRevocationChallenge(
  ctx: TestRpContext,
  challenge: string,
): Promise<AuthenticationResponseJSON> {
  const authenticator = ctx.passkeyStore.getByAccountId(ctx.accountId)!;
  const { assertionResponse } = await signSoftwareAssertion({
    privateKey: ctx.privateKey,
    credentialId: ctx.credentialId,
    rpId: RP_ID,
    challenge,
    counter: authenticator.counter,
    userVerified: true,
  });
  return assertionResponse;
}

export interface DirectRevocationTestGrant {
  grantStore: GrantRecordStore;
  passkeyStore: RegisteredPasskeyStore;
  revocationService: RevocationService;
  revocationChallengeStore: RevocationChallengeStore;
  grantNonce: string;
}

/** Seeds a Grant Record directly into a fresh `GrantRecordStore`, bypassing 001-grant's full
 * negotiate/activate ceremony entirely — matches spec.md User Story 2's own Independent Test
 * wording ("Seed Grant Records in each denial-worthy state in turn"), mirroring
 * transaction-test-helpers.ts's seedGrantRecord(). No registered passkey is needed: the
 * Grant-state gate denies before `RevocationService` ever looks one up. */
export function seedRevocationTestGrant(
  overrides: {
    status: GrantRecordStatus;
    agreedScope: CredentialScope;
    agreedDuration: { validFrom: string; validUntil: string };
  },
  challengeWindowSeconds?: number,
): DirectRevocationTestGrant {
  const grantStore = new GrantRecordStore();
  const passkeyStore = new RegisteredPasskeyStore();
  const revocationChallengeStore = new RevocationChallengeStore();
  const revocationService = new RevocationService(
    grantStore,
    passkeyStore,
    revocationChallengeStore,
    challengeWindowSeconds,
  );

  const grantNonce = crypto.randomUUID();
  const now = new Date().toISOString();
  grantStore.createPending({
    nonce: grantNonce,
    userPublicKeyRef: "seed-test-user",
    agreedScope: overrides.agreedScope,
    agreedDuration: overrides.agreedDuration,
    assuranceLevel: "UP+UV",
    nonceIssuedAt: now,
    nonceExpiresAt: now,
    status: overrides.status,
    consumedAt: null,
  });

  return { grantStore, passkeyStore, revocationService, revocationChallengeStore, grantNonce };
}
