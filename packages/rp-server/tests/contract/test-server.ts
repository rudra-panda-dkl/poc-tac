import { createApp } from "../../src/app.js";

/** Spins up a real rp-server instance on an ephemeral port, isolated from any on-disk
 * demo-state.json (`useDemoState: false`) so contract tests don't depend on — or corrupt —
 * the manual demo's state. Caller is responsible for calling `close()`. */
export async function startTestServer() {
  const { server, seeded } = await createApp({ port: 0, useDemoState: false });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server to bind to a TCP port");
  }
  const baseUrl = `http://localhost:${address.port}`;
  return {
    baseUrl,
    seeded,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
