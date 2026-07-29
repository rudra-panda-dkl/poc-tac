import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { GrantRecordStore } from "./models/grant-record-store.js";
import { RegisteredPasskeyStore } from "./models/registered-passkey-store.js";
import { AssuranceCeilingPolicy } from "./models/assurance-ceiling-policy.js";
import { PendingChallengeStore } from "./models/pending-challenge-store.js";
import { NegotiationService } from "./services/negotiation-service.js";
import { CredentialValidationService } from "./services/credential-validation-service.js";
import { seedFromDemoStateOrFresh, seedDefaultPasskey, type SeededPasskey } from "./services/seed.js";
import { RP_ID } from "./services/webauthn.js";
import { createAuthenticateOptionsHandler } from "./api/authenticate-options.js";
import { createNegotiateHandler } from "./api/negotiate.js";
import { createActivateHandler } from "./api/activate.js";

/** Builds a fully-wired rp-server instance (stores, services, HTTP routing) WITHOUT starting
 * it — separated from index.ts's CLI bootstrap so tests can create their own isolated
 * instance on an ephemeral port, seeded however the test needs (fresh vs. demo-state-derived). */
export async function createApp(options?: { port?: number; useDemoState?: boolean }) {
  const port = options?.port ?? Number(process.env.PORT ?? 4000);

  const grantStore = new GrantRecordStore();
  const passkeyStore = new RegisteredPasskeyStore();
  const pendingChallenges = new PendingChallengeStore();
  const ceilingPolicy = AssuranceCeilingPolicy.defaultPolicy();
  const negotiationService = new NegotiationService(passkeyStore, grantStore, ceilingPolicy, RP_ID);
  const validationService = new CredentialValidationService(grantStore, passkeyStore);

  const seeded: SeededPasskey =
    options?.useDemoState === false
      ? await seedDefaultPasskey(passkeyStore)
      : await seedFromDemoStateOrFresh(passkeyStore);

  const authenticateOptionsHandler = createAuthenticateOptionsHandler(pendingChallenges);
  const negotiateHandler = createNegotiateHandler(negotiationService, pendingChallenges);
  const activateHandler = createActivateHandler(validationService);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const query = Object.fromEntries(url.searchParams.entries());

      if (req.method === "GET" && url.pathname === "/grant/authenticate/options") {
        return respond(res, await authenticateOptionsHandler(query));
      }
      if (req.method === "POST" && url.pathname === "/grant/negotiate") {
        return respond(res, await negotiateHandler(await readJsonBody(req)));
      }
      if (req.method === "POST" && url.pathname === "/grant/activate") {
        return respond(res, await activateHandler(await readJsonBody(req)));
      }
      respond(res, { status: 404, body: { error: "not_found" } });
    } catch (err) {
      console.error(err);
      respond(res, { status: 500, body: { error: "internal_error" } });
    }
  });

  return { server, port, seeded, grantStore, passkeyStore };
}

function respond(res: ServerResponse, result: { status: number; body: unknown }) {
  res.writeHead(result.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.body));
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
