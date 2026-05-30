// USE CASE: frictionless consumer onboarding. Hedera's HIP-904 airdrops land directly in a
// recipient's account using their auto-association slots — the recipient never signs an
// "associate" transaction and never has to claim. Onboard N users with zero friction, the
// single biggest UX wall for token distribution on most chains.
import { PrivateKey } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);
const opPub = key.publicKey.toStringRaw();

console.log("🪂 FRICTIONLESS AIRDROP — HIP-904 auto-association, recipients sign nothing\n");

// Recipients created WITH auto-association slots (a wallet provisions these by default). They
// will receive tokens without ever submitting an association transaction of their own.
const players = [];
for (const name of ["p1", "p2", "p3", "p4"]) {
  const k = PrivateKey.generateECDSA();
  const id = (await run("hedera_create_account", {
    publicKey: k.publicKey.toStringRaw(), initialBalanceHbar: 0, maxAutomaticTokenAssociations: 5,
  })).accountId.toString();
  players.push({ name, id });
}
console.log("recipients (5 auto-assoc slots each): " + players.map((p) => p.id).join("  "));

const TOK = (await run("hedera_create_fungible_token", {
  name: "Game Gold", symbol: "GOLD", decimals: 0, initialSupply: 1_000_000, treasuryAccountId: OP, supplyKey: opPub,
})).tokenId.toString();
console.log(`token = ${TOK}\n`);

// Airdrop to each — NO prior association, NO claim step.
for (const p of players) {
  await run("hedera_token_airdrop", { tokenId: TOK, toAccountId: p.id, amount: 500 });
  console.log(`→ airdropped 500 GOLD to ${p.id} (no associate tx sent by the recipient)`);
}

await sleep(7000);
let allHold = true;
for (const p of players) {
  const held = (await mirror(M, `/api/v1/accounts/${p.id}/tokens?token.id=${TOK}`)).tokens?.[0]?.balance ?? 0;
  console.log(`   ${p.id} holds ${held} GOLD ${held === 500 ? "✓" : "✗"}`);
  if (held !== 500) allHold = false;
}
console.log(`\n✅ all ${players.length} recipients onboarded via airdrop — zero association tx by any recipient ${allHold ? "✓" : "✗"}`);

await mcp.close();
console.log(allHold ? "\nAIRDROP_OK" : "\nAIRDROP_FAIL");
process.exit(allHold ? 0 : 1);
