import { createApp } from "./app.js";
import { RP_ID } from "./services/webauthn.js";

const { server, port, seeded } = await createApp();
console.log(`Seeded default passkey for account "${seeded.accountId}"`);

server.listen(port, () => {
  console.log(`TAC rp-server listening on http://localhost:${port} (rpID=${RP_ID})`);
});
