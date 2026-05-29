// LIVE write battle test — exercises the full create path on testnet.
// The MCP server stays build-only; this harness signs each unsigned tx with the
// funded operator key from .env and submits, then verifies via Mirror Node.
//
// Run: node test-live.mjs   (needs HEDERA_OPERATOR_ID + HEDERA_OPERATOR_KEY in .env)
import { readFileSync } from "node:fs";
import { Client, PrivateKey, Transaction } from "@hashgraph/sdk";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { HEDERA_OPERATOR_ID: OP, HEDERA_OPERATOR_KEY } = process.env;
const NETWORK = process.env.HEDERA_NETWORK || "testnet";
if (!OP || !HEDERA_OPERATOR_KEY) { console.log("SKIP: set operator id + key in .env"); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function parseKey(s) {
  for (const f of [PrivateKey.fromStringECDSA, PrivateKey.fromStringED25519, PrivateKey.fromString]) {
    try { return f(s); } catch {}
  }
  throw new Error("bad key");
}
const key = parseKey(HEDERA_OPERATOR_KEY);
const opPub = key.publicKey.toStringRaw();
const client = (NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(OP, key);

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...process.env } });
const mcp = new McpClient({ name: "live", version: "0.0.0" }, { capabilities: {} });
await mcp.connect(transport);

async function run(tool, args, label) {
  const text = (await mcp.callTool({ name: tool, arguments: args })).content[0].text;
  const b64 = text.split("Transaction (base64):\n")[1]?.trim();
  if (!b64) throw new Error(`no bytes from ${tool}: ${text}`);
  const receipt = await (await Transaction.fromBytes(Buffer.from(b64, "base64")).sign(key)).execute(client).then((r) => r.getReceipt(client));
  console.log(`✅ ${label} — ${receipt.status.toString()}`);
  return receipt;
}

console.log(`LIVE write battle test on ${NETWORK} as ${OP}\n`);
const results = {};

const tokenR = await run("hedera_create_fungible_token", { name: "Battle Token", symbol: "BTL", decimals: 2, initialSupply: 1000, adminKey: opPub, supplyKey: opPub }, "create fungible token");
results.token = tokenR.tokenId.toString();

await run("hedera_mint_fungible", { tokenId: results.token, amount: 500 }, "mint fungible (+500)");

const nftR = await run("hedera_create_nft_collection", { name: "Battle NFT", symbol: "BNFT", supplyKey: opPub }, "create NFT collection");
results.nft = nftR.tokenId.toString();

const mintR = await run("hedera_mint_nft", { tokenId: results.nft, metadata: ["ipfs://battle-test-nft"] }, "mint NFT");
results.serial = mintR.serials?.[0]?.toString();

const topicR = await run("hedera_create_topic", { memo: "battle live" }, "create topic");
results.topic = topicR.topicId.toString();

await run("hedera_submit_message", { topicId: results.topic, message: "live battle test ✓" }, "submit message");

const fileR = await run("hedera_create_file", { contents: "battle test file", key: opPub }, "create file");
results.file = fileR.fileId.toString();

const schedR = await run("hedera_create_schedule", { toAccountId: "0.0.98", amountHbar: 1 }, "create scheduled transfer");
results.schedule = schedR.scheduleId.toString();

await run("hedera_transfer_hbar", { toAccountId: "0.0.98", amountHbar: 1 }, "transfer 1 ℏ");
await run("hedera_prng", { range: 100 }, "prng (random 0–99)");

// Independent Mirror Node verification
console.log("\nVerifying on Mirror Node…");
await sleep(7000);
const M = NETWORK === "mainnet" ? "https://mainnet-public.mirrornode.hedera.com" : `https://${NETWORK}.mirrornode.hedera.com`;
const tok = await fetch(`${M}/api/v1/tokens/${results.token}`).then((r) => r.json());
const nftInfo = await fetch(`${M}/api/v1/tokens/${results.nft}/nfts/${results.serial}`).then((r) => r.json());
const msgs = await fetch(`${M}/api/v1/topics/${results.topic}/messages?limit=5`).then((r) => r.json());
console.log(`  token ${results.token}: ${tok.name} (${tok.symbol}) supply=${tok.total_supply}`);
console.log(`  nft ${results.nft}#${results.serial}: owner=${nftInfo.account_id}`);
console.log(`  topic ${results.topic}: ${(msgs.messages || []).map((m) => Buffer.from(m.message, "base64").toString()).join(" | ")}`);
console.log(`  file=${results.file} schedule=${results.schedule}`);

await mcp.close();
console.log("\nLIVE_OK — created:", JSON.stringify(results));
process.exit(0);
