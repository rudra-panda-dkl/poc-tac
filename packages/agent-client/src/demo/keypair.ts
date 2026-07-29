import { writeDemoState } from "@tac/shared";
import { getOrCreateAgentKeypair } from "../keypair/generate-keypair.js";

// FR-018a (resolves OQ-3): this command's ONLY input is the RP identity — no scope or
// duration parameter exists, because the Agent must not learn negotiated terms before the
// signed credential is delivered.
const rpIdentifier = process.argv[2] ?? "localhost";

const keypair = await getOrCreateAgentKeypair(rpIdentifier);
await writeDemoState({ agentPublicKeyJwk: keypair.publicKeyJwk });

console.log(`Agent keypair generated for RP "${rpIdentifier}" (private key never leaves this process).`);
console.log(JSON.stringify(keypair.publicKeyJwk, null, 2));
