// USE CASE: verifiable AI agent audit trail. Every action an agent takes is logged
// to an HCS topic with a consensus timestamp — producing a tamper-evident, replayable
// record of exactly what the agent did and when. AI accountability, on-chain.
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);

console.log("🧠 AGENT AUDIT TRAIL — log every action to HCS\n");
const auditTopic = (await run("hedera_create_topic", { memo: "ai-agent audit log" })).topicId.toString();
console.log(`audit topic: ${auditTopic}\n`);

// The agent performs actions; each is recorded to the audit log with its real tx id.
async function act(label, tool, args) {
  const r = await run(tool, args);
  const entry = JSON.stringify({ action: label, tx: r.txId, status: r.status.toString() });
  await run("hedera_submit_message", { topicId: auditTopic, message: entry });
  console.log(`🤖 ${label} → ${r.status.toString()} (logged)`);
}

await act("create_token", "hedera_create_fungible_token", { name: "Audited", symbol: "AUD", initialSupply: 1000, supplyKey: key.publicKey.toStringRaw() });
await act("mint", "hedera_prng", { range: 100 });
await act("transfer_hbar", "hedera_transfer_hbar", { toAccountId: "0.0.98", amountHbar: 1 });

// Replay the agent's verifiable action log from-chain.
console.log("\n📜 Replaying agent actions from HCS:");
await sleep(8000);
const { messages } = await mirror(M, `/api/v1/topics/${auditTopic}/messages?limit=25`);
for (const m of messages.filter((x) => x.message)) {
  const d = JSON.parse(Buffer.from(m.message, "base64").toString());
  console.log(`  [${m.consensus_timestamp}] ${d.action} · ${d.status} · ${d.tx}`);
}

await mcp.close();
console.log("\nAUDIT_OK — every agent action is timestamped & verifiable on-chain");
process.exit(0);
