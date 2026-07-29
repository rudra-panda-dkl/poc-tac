import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Demo-only, local-machine state handoff between the three separate `npm run demo:*` CLI
 * processes (rp-server, agent-client, user-client) that quickstart.md's Scenario 1 walks
 * through as sequential commands. NOT a security boundary and NOT part of the protocol itself
 * — a real deployment has these as genuinely separate, long-running processes communicating
 * only over the network; this file exists purely so a one-shot CLI demo can pass along values
 * (like which passkey was seeded) between process invocations on one developer machine. */
export interface DemoState {
  seededPasskey?: {
    accountId: string;
    privateKeyJwk: JsonWebKey;
    publicKeyJwk: JsonWebKey;
    credentialId: string;
  };
  negotiation?: {
    accountId: string;
    nonce: string;
    agreedScope: Record<string, unknown>;
    agreedDuration: { validFrom: string; validUntil: string };
    assuranceLevel: string;
    rpIdentifier: string;
    nonceExpiresAt: string;
  };
  agentPublicKeyJwk?: JsonWebKey;
  /** The seeded credential's last-known authenticator signature counter — WebAuthn assertions
   * must use a strictly-increasing counter (@simplewebauthn/server enforces this once any
   * non-zero counter has been seen), so ceremony two's demo signer needs to know what ceremony
   * one's already-verified-and-stored counter was. */
  lastCounter?: number;
}

function demoStatePath(): string {
  // this file lives at packages/shared/dist/demo-state.js at runtime — three levels up is the
  // repo root, regardless of which package's process imports it or what that process's cwd is.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", ".tac-demo-state.json");
}

export async function readDemoState(): Promise<DemoState> {
  try {
    const raw = await readFile(demoStatePath(), "utf8");
    return JSON.parse(raw) as DemoState;
  } catch {
    return {};
  }
}

export async function writeDemoState(partial: Partial<DemoState>): Promise<void> {
  const current = await readDemoState();
  const merged = { ...current, ...partial };
  await writeFile(demoStatePath(), JSON.stringify(merged, null, 2));
}
