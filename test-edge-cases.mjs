// EDGE CASES — probes paths the happy-path battle/scenarios miss:
//  1. File > single-tx chunk → create + append (Hedera caps a single FileContents tx at ~4 KB)
//  2. Topic message chunking — single submit_message above the 1024-byte single-chunk limit
//  3. NFT royalty fee (HTS custom-fee composition we never exercised live)
//  4. Approved spend — battle approved an allowance but never had the spender actually use it
//  5. HBAR transfer to a fresh ED25519 alias → auto-account-create
//  6. decode_transaction round-trip — build → decode → fields match
// Run: node test-edge-cases.mjs
import { Client, PrivateKey, Transaction, TransferTransaction, AccountId, Hbar } from "@hashgraph/sdk";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { HEDERA_OPERATOR_ID: OP, HEDERA_OPERATOR_KEY } = process.env;
const NETWORK = process.env.HEDERA_NETWORK || "testnet";
function parseKey(s) {
  const clean = s.replace(/^0x/, "").toLowerCase();
  const order = clean.startsWith("302e020100300506032b6570")
    ? [PrivateKey.fromStringED25519, PrivateKey.fromStringECDSA, PrivateKey.fromString]
    : [PrivateKey.fromStringECDSA, PrivateKey.fromStringED25519, PrivateKey.fromString];
  for (const f of order) { try { return f(s); } catch {} }
  throw new Error("bad key");
}
const key = parseKey(HEDERA_OPERATOR_KEY);
const opPub = key.publicKey.toStringRaw();
const client = (NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(OP, key);
const M = `https://${NETWORK}.mirrornode.hedera.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...process.env } });
const mcp = new McpClient({ name: "edge", version: "0.0.0" }, { capabilities: {} });
await mcp.connect(transport);

let pass = 0, fail = 0;
async function run(tool, args, label, extra = []) {
  try {
    const text = (await mcp.callTool({ name: tool, arguments: args })).content[0].text;
    const b64 = text.split("Transaction (base64):\n")[1]?.trim();
    if (!b64) throw new Error("no bytes");
    let tx = await Transaction.fromBytes(Buffer.from(b64, "base64")).sign(key);
    for (const s of extra) tx = await tx.sign(s);
    const r = await (await tx.execute(client)).getReceipt(client);
    console.log(`✅ ${label} — ${r.status.toString()}`);
    pass++; return r;
  } catch (e) {
    console.log(`❌ ${label} — ${(e.message ?? e).toString().slice(0, 100)}`);
    fail++; return null;
  }
}

console.log(`\nEDGE-CASE PROBE on ${NETWORK} as ${OP}\n`);

// — 1. Large file via append (Hedera single-tx chunk ≈ 4096 bytes; force 2 chunks)
console.log("[1] large file → create + append (> 1 chunk)");
const big1 = "A".repeat(3500);
const big2 = "B".repeat(3500);
const fr = await run("hedera_create_file", { contents: big1, key: opPub }, "create file (chunk 1: 3500B)");
const fileId = fr?.fileId?.toString();
if (fileId) {
  await run("hedera_append_file", { fileId, contents: big2 }, "append file (chunk 2: 3500B → 7000B total)");
  await sleep(4000);
  const fc = await fetch(`${M}/api/v1/files/${fileId}`).then(r => r.json()).catch(() => null);
  console.log(`   mirror size hint: ${fc?.size ?? "n/a"} bytes (expected ~7000)`);
}

// — 2. Topic message just over single-chunk SDK boundary (>1024 bytes; SDK auto-chunks)
console.log("\n[2] topic message > 1024 bytes (SDK auto-chunk)");
const tr = await run("hedera_create_topic", { memo: "edge-chunk" }, "create chunked-topic");
const topicId = tr?.topicId?.toString();
if (topicId) {
  const longMsg = "X".repeat(1200); // > single-chunk
  await run("hedera_submit_message", { topicId, message: longMsg }, "submit 1200-byte message (auto-chunked)");
  await sleep(5000);
  const msgs = await fetch(`${M}/api/v1/topics/${topicId}/messages`).then(r => r.json()).catch(() => ({ messages: [] }));
  // SDK auto-chunks > 1024 B into N mirror entries sharing one chunk_info.initial_transaction_id.
  // Reassemble by that id (ordered by chunk number) to verify the full payload round-trips.
  const groups = {};
  for (const m of msgs.messages ?? []) {
    const id = m.chunk_info?.initial_transaction_id?.transaction_valid_start ?? m.consensus_timestamp;
    (groups[id] ||= []).push(m);
  }
  const biggest = Object.values(groups).sort((a, b) => b.length - a.length)[0] ?? [];
  const decoded = biggest
    .sort((a, b) => (a.chunk_info?.number ?? 0) - (b.chunk_info?.number ?? 0))
    .map(m => Buffer.from(m.message, "base64").toString())
    .join("");
  console.log(`   reassembled length: ${decoded.length} bytes across ${biggest.length} chunk(s) ${decoded.length === 1200 ? "✓" : "✗"}`);
}

// — 3. NFT collection with royalty custom fee (fallback fixed HBAR)
console.log("\n[3] NFT collection with royalty fee");
const nr = await run("hedera_create_nft_collection", {
  name: "Royalty NFT", symbol: "ROY", treasuryAccountId: OP,
  supplyKey: opPub, adminKey: opPub,
  customFees: [{ type: "royalty", numerator: 10, denominator: 100, fallbackFixedHbar: 1, collectorAccountId: OP }]
}, "create NFT with 10% royalty + 1ℏ fallback");

// — 4. Approved spend — operator approves spender B; B then pulls tokens via approved transfer
console.log("\n[4] approved spend by 2nd party (delegated transfer)");
const keyB = PrivateKey.generateECDSA();
const acctR = await run("hedera_create_account", { publicKey: keyB.publicKey.toStringRaw(), initialBalanceHbar: 2 }, "create B (spender)");
const acctB = acctR?.accountId?.toString();
const tokR = await run("hedera_create_fungible_token", {
  name: "Approve Test", symbol: "APRV", treasuryAccountId: OP, decimals: 0, initialSupply: 1000,
  adminKey: opPub, supplyKey: opPub
}, "create token APRV");
const tokenId = tokR?.tokenId?.toString();
if (acctB && tokenId) {
  // B associates
  const aT = (await mcp.callTool({ name: "hedera_associate_token", arguments: { accountId: acctB, tokenIds: [tokenId] } })).content[0].text;
  const aB64 = aT.split("Transaction (base64):\n")[1].trim();
  const aTx = await (await Transaction.fromBytes(Buffer.from(aB64, "base64")).sign(key)).sign(keyB);
  await (await aTx.execute(client)).getReceipt(client);
  console.log("✅ B associated APRV"); pass++;
  // Operator approves B to spend 500 from operator
  await run("hedera_approve_token_allowance", { ownerAccountId: OP, spenderAccountId: acctB, tokenId, amount: 500 }, "operator approves B for 500");
  // B uses the approval to pull 200 → B (signed by B only, fee paid by B)
  try {
    // No setTransactionId — freezeWith(clientB) auto-generates the id from B's
    // operator, so B is the payer of its own approved pull (the semantics we want).
    const pull = await new TransferTransaction()
      .addApprovedTokenTransfer(tokenId, OP, -200)
      .addTokenTransfer(tokenId, acctB, 200)
      .freezeWith((NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(acctB, keyB));
    const signed = await pull.sign(keyB);
    const r = await (await signed.execute((NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(acctB, keyB))).getReceipt((NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(acctB, keyB));
    console.log(`✅ approved spend: B pulled 200 APRV from operator → ${r.status.toString()}`); pass++;
    await sleep(4000);
    const bal = await fetch(`${M}/api/v1/accounts/${acctB}/tokens`).then(r => r.json());
    const hold = bal.tokens?.find(t => t.token_id === tokenId)?.balance;
    console.log(`   B holds: ${hold} APRV  ${hold === 200 ? "✓" : "✗"}`);
  } catch (e) {
    console.log(`❌ approved spend — ${e.message.slice(0, 100)}`); fail++;
  }
}

// — 5. HBAR transfer to a fresh ED25519 alias → auto account creation
console.log("\n[5] HBAR → fresh ED25519 alias (auto-create)");
const aliasKey = PrivateKey.generateED25519();
const aliasAcct = aliasKey.publicKey.toAccountId(0, 0).toString();
try {
  const ar = await new TransferTransaction()
    .addHbarTransfer(OP, new Hbar(-1))
    .addHbarTransfer(AccountId.fromString(aliasAcct), new Hbar(1))
    .freezeWith(client);
  const sig = await ar.sign(key);
  const r = await (await sig.execute(client)).getReceipt(client);
  console.log(`✅ HBAR → alias auto-create → ${r.status.toString()}`); pass++;
  await sleep(5000);
  // resolve alias to real account id via mirror
  const ev = await fetch(`${M}/api/v1/accounts?account.publickey=${aliasKey.publicKey.toStringRaw()}`).then(r => r.json());
  const newAcct = ev.accounts?.[0];
  console.log(`   alias resolved to: ${newAcct?.account} (balance ${(newAcct?.balance?.balance ?? 0) / 1e8} ℏ) ${newAcct?.account ? "✓" : "✗"}`);
} catch (e) {
  console.log(`❌ alias auto-create — ${e.message.slice(0, 100)}`); fail++;
}

// — 6. decode_transaction round-trip: build a tx via MCP → decode via MCP → check fields
console.log("\n[6] decode_transaction round-trip");
try {
  const built = (await mcp.callTool({ name: "hedera_transfer_hbar", arguments: { fromAccountId: OP, toAccountId: "0.0.98", amountHbar: 0.001 } })).content[0].text;
  const b64 = built.split("Transaction (base64):\n")[1].trim();
  const dec = (await mcp.callTool({ name: "hedera_decode_transaction", arguments: { transactionBase64: b64 } })).content[0].text;
  const parsed = JSON.parse(dec);
  const ok = parsed.type?.includes("Transfer") && parsed.transactionId?.startsWith(OP);
  console.log(`✅ decode_transaction → type=${parsed.type}, tx=${parsed.transactionId?.slice(0, 40)}… ${ok ? "✓" : "✗"}`); ok ? pass++ : fail++;
} catch (e) {
  console.log(`❌ decode round-trip — ${e.message.slice(0, 100)}`); fail++;
}

await mcp.close();
console.log(`\n=== EDGE: ${pass} passed · ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
