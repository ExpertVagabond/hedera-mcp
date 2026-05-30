// USE CASE: a verifiable, multi-agent reputation ledger. Independent AI agents post signed
// work-receipts to a shared HCS topic; anyone can replay the topic to compute each agent's
// track record. Append-only, consensus-timestamped, no central reputation database — the natural
// substrate for an agent marketplace where you must trust a counterparty you've never met.
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);

console.log("🤝 AGENT REPUTATION — multi-agent work-receipts on a shared HCS ledger\n");

const TOPIC = (await run("hedera_create_topic", { memo: "agent-reputation" })).topicId.toString();
console.log(`reputation topic = ${TOPIC}`);

// Three agents each report completed tasks with a client rating (1–5).
const receipts = [
  { agent: "researcher-01", task: "summarize-10k", rating: 5 },
  { agent: "researcher-01", task: "extract-entities", rating: 4 },
  { agent: "coder-02", task: "fix-flaky-test", rating: 5 },
  { agent: "coder-02", task: "refactor-module", rating: 3 },
  { agent: "coder-02", task: "add-types", rating: 4 },
  { agent: "ops-03", task: "rotate-keys", rating: 5 },
];
for (const r of receipts) {
  await run("hedera_submit_message", { topicId: TOPIC, message: JSON.stringify({ kind: "work_receipt", ...r }) });
}
console.log(`posted ${receipts.length} work-receipts from 3 agents`);

await sleep(7000);
const log = ((await mirror(M, `/api/v1/topics/${TOPIC}/messages`)).messages ?? [])
  .map((m) => JSON.parse(Buffer.from(m.message, "base64").toString()));
const board = {};
for (const e of log) (board[e.agent] ||= []).push(e.rating);
console.log(`\n📊 reputation reconstructed purely from the on-chain ledger:`);
for (const [agent, rs] of Object.entries(board)) {
  const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
  console.log(`   ${agent}: ${rs.length} tasks · avg rating ${avg.toFixed(2)}`);
}

const ok = log.length === receipts.length && Object.keys(board).length === 3;
console.log(`\n✅ ${log.length}/${receipts.length} receipts replayed · ${Object.keys(board).length} agents scored from history ${ok ? "✓" : "✗"}`);

await mcp.close();
console.log(ok ? "\nREP_OK" : "\nREP_FAIL");
process.exit(ok ? 0 : 1);
