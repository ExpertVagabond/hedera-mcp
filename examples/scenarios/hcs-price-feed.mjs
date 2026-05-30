// USE CASE: a cheap, fair-ordered oracle / data bus. Publish price ticks to an HCS topic; every
// consumer reads the SAME consensus-ordered, timestamped sequence — no sequencer or off-chain
// relay to trust. Cross-checked here against the network's own native HBAR↔USD exchange rate.
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);

console.log("📈 HCS PRICE FEED — consensus-ordered oracle bus + native HBAR/USD rate\n");

const TOPIC = (await run("hedera_create_topic", { memo: "feed:HBAR-USD" })).topicId.toString();
console.log(`feed topic = ${TOPIC}`);

const ticks = [
  { seq: 0, px: 0.0712 }, { seq: 1, px: 0.0718 }, { seq: 2, px: 0.0709 },
  { seq: 3, px: 0.0725 }, { seq: 4, px: 0.0731 },
];
for (const t of ticks) {
  await run("hedera_submit_message", { topicId: TOPIC, message: JSON.stringify({ sym: "HBAR/USD", seq: t.seq, px: t.px }) });
}
console.log(`published ${ticks.length} price ticks`);

await sleep(7000);
const msgs = await mirror(M, `/api/v1/topics/${TOPIC}/messages`);
const feed = (msgs.messages ?? []).map((m) => JSON.parse(Buffer.from(m.message, "base64").toString()));
console.log(`\n📜 feed read back (consensus order):`);
for (const f of feed) console.log(`   seq ${f.seq}  ${f.sym} = $${f.px}`);
const ordered = feed.every((f, i) => i === 0 || f.seq > feed[i - 1].seq);

// Cross-check against the network's own on-chain oracle (HBAR↔USD), read via the MCP.
const ex = JSON.parse((await mcp.callTool({ name: "hedera_get_exchange_rate", arguments: {} })).content[0].text);
const cur = ex.current_rate;
const usdPerHbar = cur ? cur.cent_equivalent / cur.hbar_equivalent / 100 : null;
console.log(`\n🔗 network exchange rate: ${cur?.hbar_equivalent} ℏ = ${cur?.cent_equivalent}¢  →  $${usdPerHbar?.toFixed(4)} / ℏ`);

const ok = feed.length === ticks.length && ordered && usdPerHbar != null;
console.log(`\n✅ ${feed.length}/${ticks.length} ticks, strictly consensus-ordered ${ordered ? "✓" : "✗"} · native rate read ${usdPerHbar != null ? "✓" : "✗"}`);

await mcp.close();
console.log(ok ? "\nFEED_OK" : "\nFEED_FAIL");
process.exit(ok ? 0 : 1);
