// USE CASE: agent-to-agent payments. Agent A mints a "service credits" token,
// onboards Agent B, and pays B per task — with each payment logged to an HCS
// commerce ledger. Metered, auditable agent-to-agent value transfer.
import { PrivateKey } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);
const keyB = PrivateKey.generateECDSA();

console.log("💸 AGENT-TO-AGENT PAYMENTS\n");

// Agent B comes online (new account).
const B = (await run("hedera_create_account", { publicKey: keyB.publicKey.toStringRaw(), initialBalanceHbar: 2 })).accountId.toString();
console.log(`agent A = ${OP}  ·  agent B = ${B}`);

// A issues service credits and a commerce ledger topic.
const CRED = (await run("hedera_create_fungible_token", { name: "Service Credits", symbol: "SVC", decimals: 0, initialSupply: 100000, supplyKey: key.publicKey.toStringRaw() })).tokenId.toString();
const ledger = (await run("hedera_create_topic", { memo: "agent commerce ledger" })).topicId.toString();
await run("hedera_associate_token", { accountId: B, tokenIds: [CRED] }, [keyB]);
console.log(`credits token = ${CRED}  ·  ledger = ${ledger}\n`);

// B performs tasks for A; A pays B per task, logging each payment.
async function pay(task, amount) {
  await run("hedera_transfer_token", { tokenId: CRED, toAccountId: B, amount });
  await run("hedera_submit_message", { topicId: ledger, message: JSON.stringify({ from: OP, to: B, task, credits: amount }) });
  console.log(`🤝 A paid B ${amount} SVC for "${task}"`);
}
await pay("summarize-document", 50);
await pay("generate-image", 120);
await pay("run-analysis", 80);

await sleep(8000);
const bal = await mirror(M, `/api/v1/accounts/${B}/tokens`);
const held = bal.tokens?.find((t) => t.token_id === CRED)?.balance;
console.log(`\n✅ agent B balance: ${held} SVC (verified on Mirror Node)`);
const { messages } = await mirror(M, `/api/v1/topics/${ledger}/messages?limit=10`);
console.log(`✅ commerce ledger entries: ${messages.filter((m) => m.message).length}`);

await mcp.close();
console.log("\nPAYMENTS_OK");
process.exit(0);
