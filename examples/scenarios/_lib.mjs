// Shared harness for scenario scripts. Run scenarios from the project root:
//   node examples/scenarios/<name>.mjs
import { readFileSync } from "node:fs";
import { Client, PrivateKey, Transaction } from "@hashgraph/sdk";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv() {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
export function parseKey(s) {
  for (const f of [PrivateKey.fromStringECDSA, PrivateKey.fromStringED25519, PrivateKey.fromString]) {
    try { return f(s); } catch {}
  }
  throw new Error("bad key");
}

export async function connect() {
  loadEnv();
  const OP = process.env.HEDERA_OPERATOR_ID;
  const NETWORK = process.env.HEDERA_NETWORK || "testnet";
  if (!OP || !process.env.HEDERA_OPERATOR_KEY) { console.log("SKIP: operator id + key required in .env"); process.exit(0); }
  const key = parseKey(process.env.HEDERA_OPERATOR_KEY);
  const client = (NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(OP, key);
  const M = NETWORK === "mainnet" ? "https://mainnet-public.mirrornode.hedera.com" : `https://${NETWORK}.mirrornode.hedera.com`;
  const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...process.env } });
  const mcp = new McpClient({ name: "scenario", version: "0.0.0" }, { capabilities: {} });
  await mcp.connect(transport);
  return { mcp, client, key, OP, NETWORK, M };
}

// Build (via MCP) -> sign (operator + extras) -> submit -> receipt (with .txId attached).
export function runner(mcp, client, key) {
  return async (tool, args, extra = []) => {
    const text = (await mcp.callTool({ name: tool, arguments: args })).content[0].text;
    const b64 = text.split("Transaction (base64):\n")[1]?.trim();
    if (!b64) throw new Error(`no bytes from ${tool}: ${text.slice(0, 90)}`);
    let tx = await Transaction.fromBytes(Buffer.from(b64, "base64")).sign(key);
    for (const s of extra) tx = await tx.sign(s);
    const resp = await tx.execute(client);
    const receipt = await resp.getReceipt(client);
    const txId = resp.transactionId.toString();
    // TransactionReceipt is frozen — expose txId via a proxy instead of mutating it.
    return new Proxy(receipt, { get: (t, p) => (p === "txId" ? txId : t[p]) });
  };
}

export const mirror = (M, path) => fetch(`${M}${path}`).then((r) => r.json());
