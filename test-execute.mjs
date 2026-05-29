// LIVE testnet verification — proves the server's BUILD-ONLY output is valid and
// submittable WITHOUT the server ever holding a key.
//
// Flow: MCP server builds an unsigned tx (base64) -> this harness signs it with a
// throwaway testnet key from .env and submits -> reads the result from Mirror Node.
//
// Setup (creds you can rotate immediately after):
//   1. Get a free testnet account at https://portal.hedera.com (operator id + key + test HBAR)
//   2. Create .env (gitignored):
//        HEDERA_NETWORK=testnet
//        HEDERA_OPERATOR_ID=0.0.xxxxxx
//        HEDERA_OPERATOR_KEY=302e0201...   (DER or hex ECDSA/ED25519 private key)
//   3. node test-execute.mjs
//
// The key lives only in .env on disk and is used only by THIS harness — never by
// the MCP server, which stays build-only.

import { readFileSync } from "node:fs";
import { Client, PrivateKey, Transaction } from "@hashgraph/sdk";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env — rely on process.env */
  }
}
loadEnv();

const { HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY } = process.env;
const NETWORK = process.env.HEDERA_NETWORK || "testnet";

if (!HEDERA_OPERATOR_ID || !HEDERA_OPERATOR_KEY) {
  console.log("SKIP: set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env to run the live submit test.");
  console.log("      Get a free testnet account at https://portal.hedera.com (rotate the key after).");
  process.exit(0);
}

const MIRROR =
  process.env.HEDERA_MIRROR_URL ||
  (NETWORK === "mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : `https://${NETWORK}.mirrornode.hedera.com`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. Spawn the build-only MCP server ---
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, HEDERA_NETWORK: NETWORK, HEDERA_OPERATOR_ID },
});
const mcp = new McpClient({ name: "execute-test", version: "0.0.0" }, { capabilities: {} });
await mcp.connect(transport);

const key = PrivateKey.fromStringDer
  ? safeKey(HEDERA_OPERATOR_KEY)
  : PrivateKey.fromString(HEDERA_OPERATOR_KEY);
function safeKey(s) {
  try { return PrivateKey.fromStringECDSA(s); } catch {}
  try { return PrivateKey.fromStringED25519(s); } catch {}
  return PrivateKey.fromString(s);
}

const client = (NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(
  HEDERA_OPERATOR_ID,
  key,
);

function extractB64(text) {
  return text.split("Transaction (base64):\n")[1]?.trim();
}

async function buildSignSubmit(toolName, args, label) {
  const res = await mcp.callTool({ name: toolName, arguments: args });
  const b64 = extractB64(res.content[0].text);
  if (!b64) throw new Error(`no bytes from ${toolName}: ${res.content[0].text}`);
  const tx = Transaction.fromBytes(Buffer.from(b64, "base64"));
  const signed = await tx.sign(key);
  const resp = await signed.execute(client);
  const receipt = await resp.getReceipt(client);
  console.log(`✅ ${label}: status=${receipt.status.toString()} txId=${resp.transactionId.toString()}`);
  return receipt;
}

console.log(`Live submit test on ${NETWORK} as ${HEDERA_OPERATOR_ID}\n`);

// --- 2. Build-only -> sign -> submit: create an HCS topic ---
const topicReceipt = await buildSignSubmit("hedera_create_topic", { memo: "hedera-mcp live verify" }, "create_topic");
const topicId = topicReceipt.topicId.toString();

// --- 3. Submit a message to it ---
await buildSignSubmit("hedera_submit_message", { topicId, message: "hello from build-only mcp" }, "submit_message");

// --- 4. Verify independently via Mirror Node ---
console.log("\nWaiting for Mirror Node to index…");
await sleep(6000);
const mirror = await fetch(`${MIRROR}/api/v1/topics/${topicId}/messages?limit=5`).then((r) => r.json());
const msgs = (mirror.messages || []).map((m) => Buffer.from(m.message, "base64").toString("utf8"));
console.log(`Mirror Node confirms topic ${topicId} messages:`, msgs);

await mcp.close();
console.log("\nEXECUTE_OK");
process.exit(0);
