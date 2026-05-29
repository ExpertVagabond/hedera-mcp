// USE CASE: 1-prompt notary — proof-of-existence via an HCS consensus timestamp.
// Hash a document, submit the hash to a topic, then verify it on-chain. Any later
// tamper produces a different hash, so the original timestamp proves what existed when.
import crypto from "node:crypto";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, M } = await connect();
const run = runner(mcp, client, key);

const document = "Research report: 'SCONE-bench → Solana' — Matthew Karsten, 2026. (demo document)";
const hash = crypto.createHash("sha256").update(document).digest("hex");
console.log("📄 NOTARY — proof-of-existence on Hedera\n");
console.log(`document: "${document}"`);
console.log(`sha256:   ${hash}\n`);

const topic = (await run("hedera_create_topic", { memo: "notary: proof-of-existence" })).topicId.toString();
await run("hedera_submit_message", { topicId: topic, message: `sha256:${hash}` });
console.log(`✅ notarized → topic ${topic}`);

await sleep(7000);
const { messages } = await mirror(M, `/api/v1/topics/${topic}/messages?limit=1`);
const onchain = Buffer.from(messages[0].message, "base64").toString();
console.log(`✅ on-chain consensus timestamp: ${messages[0].consensus_timestamp}`);
console.log(`   stored: ${onchain}`);
console.log(`   verify original doc: ${onchain === `sha256:${hash}` ? "✓ PROOF VALID" : "✗"}`);

const tampered = crypto.createHash("sha256").update(document + " [secretly altered]").digest("hex");
console.log(`   tamper check: altered doc → ${tampered.slice(0, 16)}… ≠ notarized ${hash.slice(0, 16)}… ⇒ tampering detectable`);

await mcp.close();
console.log("\nNOTARY_OK");
process.exit(0);
