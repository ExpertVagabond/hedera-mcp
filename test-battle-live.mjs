// BATTLE MODE — full multi-account lifecycle, executed on testnet.
// Operator (from .env) funds + signs; a freshly-created counterparty account B
// signs its own associations. The MCP server stays build-only throughout;
// this harness signs each unsigned tx and submits, verifying via Mirror Node.
//
// Run: node test-battle-live.mjs
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
if (!OP || !HEDERA_OPERATOR_KEY) { console.log("SKIP: operator id + key required in .env"); process.exit(0); }

function parseKey(s) {
  for (const f of [PrivateKey.fromStringECDSA, PrivateKey.fromStringED25519, PrivateKey.fromString]) {
    try { return f(s); } catch {}
  }
  throw new Error("bad key");
}
const key = parseKey(HEDERA_OPERATOR_KEY);
const opPub = key.publicKey.toStringRaw();
const keyB = PrivateKey.generateECDSA();
const client = (NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(OP, key);
const M = NETWORK === "mainnet" ? "https://mainnet-public.mirrornode.hedera.com" : `https://${NETWORK}.mirrornode.hedera.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...process.env } });
const mcp = new McpClient({ name: "battle-live", version: "0.0.0" }, { capabilities: {} });
await mcp.connect(transport);

let pass = 0, fail = 0; const failed = [];
async function run(tool, args, label, extra = []) {
  try {
    const text = (await mcp.callTool({ name: tool, arguments: args })).content[0].text;
    const b64 = text.split("Transaction (base64):\n")[1]?.trim();
    if (!b64) throw new Error("no bytes: " + text.slice(0, 70));
    let tx = await Transaction.fromBytes(Buffer.from(b64, "base64")).sign(key);
    for (const s of extra) tx = await tx.sign(s);
    const r = await (await tx.execute(client)).getReceipt(client);
    console.log(`✅ ${label} — ${r.status.toString()}`);
    pass++; return r;
  } catch (e) {
    console.log(`❌ ${label} — ${(e.message ?? e).toString().slice(0, 95)}`);
    fail++; failed.push(label); return null;
  }
}

console.log(`BATTLE MODE on ${NETWORK} · operator ${OP}\n`);

// --- Accounts ---
const accBr = await run("hedera_create_account", { publicKey: keyB.publicKey.toStringRaw(), initialBalanceHbar: 5 }, "create counterparty account B");
const B = accBr?.accountId?.toString();

// --- Fungible token: full key set + full lifecycle ---
const tokR = await run("hedera_create_fungible_token", {
  name: "Battle Coin", symbol: "BATL", decimals: 2, initialSupply: 100000,
  adminKey: opPub, supplyKey: opPub, freezeKey: opPub, kycKey: opPub, pauseKey: opPub, wipeKey: opPub,
}, "create fungible token (all keys)");
const TOK = tokR?.tokenId?.toString();

if (TOK && B) {
  await run("hedera_mint_fungible", { tokenId: TOK, amount: 50000 }, "mint +50000");
  await run("hedera_associate_token", { accountId: B, tokenIds: [TOK] }, "associate B ↔ token", [keyB]);
  await run("hedera_grant_kyc", { tokenId: TOK, accountId: B }, "grant KYC to B");
  await run("hedera_transfer_token", { tokenId: TOK, toAccountId: B, amount: 10000 }, "transfer 10000 → B");
  await run("hedera_freeze_token_account", { tokenId: TOK, accountId: B }, "freeze B");
  await run("hedera_unfreeze_token_account", { tokenId: TOK, accountId: B }, "unfreeze B");
  await run("hedera_pause_token", { tokenId: TOK }, "pause token");
  await run("hedera_unpause_token", { tokenId: TOK }, "unpause token");
  await run("hedera_approve_token_allowance", { tokenId: TOK, spenderAccountId: B, amount: 500 }, "approve token allowance → B");
  await run("hedera_update_token", { tokenId: TOK, memo: "battled" }, "update token memo");
  await run("hedera_token_airdrop", { tokenId: TOK, toAccountId: B, amount: 250 }, "airdrop 250 → B");
  await run("hedera_wipe_token", { tokenId: TOK, accountId: B, amount: 100 }, "wipe 100 from B");
  await run("hedera_burn_token", { tokenId: TOK, amount: 1000 }, "burn 1000 from treasury");
}

// --- NFT lifecycle ---
const nftR = await run("hedera_create_nft_collection", { name: "Battle NFTs", symbol: "BNFT", supplyKey: opPub, adminKey: opPub }, "create NFT collection");
const NFT = nftR?.tokenId?.toString();
let serial;
if (NFT && B) {
  const mintR = await run("hedera_mint_nft", { tokenId: NFT, metadata: ["ipfs://battle-1", "ipfs://battle-2"] }, "mint 2 NFTs");
  serial = mintR?.serials?.[0]?.toString();
  await run("hedera_associate_token", { accountId: B, tokenIds: [NFT] }, "associate B ↔ NFT", [keyB]);
  if (serial) await run("hedera_transfer_nft", { tokenId: NFT, serial: Number(serial), toAccountId: B }, `transfer NFT #${serial} → B`);
  await run("hedera_approve_nft_allowance", { tokenId: NFT, spenderAccountId: B }, "approve NFT allowance → B");
}

// --- Consensus ---
const topicR = await run("hedera_create_topic", { memo: "battle mode", adminKey: opPub, submitKey: opPub }, "create topic");
const TOPIC = topicR?.topicId?.toString();
if (TOPIC) {
  await run("hedera_submit_message", { topicId: TOPIC, message: "battle mode message ✓" }, "submit message");
  await run("hedera_update_topic", { topicId: TOPIC, memo: "battle mode v2" }, "update topic");
}

// --- File ---
const fileR = await run("hedera_create_file", { contents: "battle file v1", key: opPub }, "create file");
const FILE = fileR?.fileId?.toString();
if (FILE) {
  await run("hedera_append_file", { fileId: FILE, contents: " + appended" }, "append file");
  await run("hedera_update_file", { fileId: FILE, contents: "battle file v2" }, "update file");
}

// --- Schedule (create then sign → executes) ---
// Schedule a transfer FROM B so it genuinely needs B's signature (won't auto-execute at creation).
const schedR = B
  ? await run("hedera_create_schedule", { fromAccountId: B, toAccountId: OP, amountHbar: 1 }, "create scheduled transfer (from B)")
  : null;
const SCHED = schedR?.scheduleId?.toString();
if (SCHED) await run("hedera_sign_schedule", { scheduleId: SCHED }, "sign schedule with B (executes)", [keyB]);

// --- Misc + cleanup ---
await run("hedera_prng", { range: 1000 }, "prng (0–999)");
await run("hedera_transfer_hbar", { toAccountId: B || "0.0.98", amountHbar: 2 }, "transfer 2 ℏ → B");
if (TOK) await run("hedera_delete_token", { tokenId: TOK }, "delete token (admin)");

// --- Independent Mirror Node verification ---
console.log("\nVerifying on Mirror Node…");
await sleep(8000);
if (TOK) { const t = await fetch(`${M}/api/v1/tokens/${TOK}`).then((r) => r.json()); console.log(`  token ${TOK}: ${t.name} memo="${t.memo}" supply=${t.total_supply} deleted=${t.deleted}`); }
if (NFT && serial) { const n = await fetch(`${M}/api/v1/tokens/${NFT}/nfts/${serial}`).then((r) => r.json()); console.log(`  nft ${NFT}#${serial}: owner=${n.account_id}`); }
if (B) { const bt = await fetch(`${M}/api/v1/accounts/${B}/tokens`).then((r) => r.json()); console.log(`  account B ${B}: holds ${bt.tokens?.length ?? 0} token type(s)`); }
if (TOPIC) { const msgs = await fetch(`${M}/api/v1/topics/${TOPIC}/messages?limit=5`).then((r) => r.json()); console.log(`  topic ${TOPIC}: ${(msgs.messages || []).map((m) => Buffer.from(m.message, "base64").toString()).join(" | ")}`); }

console.log(`\n=== BATTLE: ${pass} passed · ${fail} failed ===`);
if (failed.length) console.log("FAILED:", failed.join(", "));
await mcp.close();
process.exit(fail ? 1 : 0);
