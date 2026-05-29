// Narrated "Day 1 developer" walkthrough — the certified→building on-ramp, build-only
// (no key required). Great for a screen-share. Run: node demo.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, HEDERA_NETWORK: "testnet", HEDERA_OPERATOR_ID: "0.0.1001" },
});
const mcp = new Client({ name: "demo", version: "0.0.0" }, { capabilities: {} });
await mcp.connect(transport);

const call = async (name, args = {}) => (await mcp.callTool({ name, arguments: args })).content[0].text;
const step = (n, t) => console.log(`\n\x1b[1m${n}. ${t}\x1b[0m`);

console.log("=== hedera-mcp: a developer's first session on Hedera (build-only) ===");

step(1, "Orient: what's HBAR worth right now? (live Mirror Node)");
console.log(await call("hedera_get_exchange_rate"));

step(2, "Build your first token (HTS) — no SDK boilerplate, one tool call");
console.log(await call("hedera_create_fungible_token", { name: "DevPoints", symbol: "DEVP", initialSupply: 1000 }));

step(3, "Stand up an HCS topic for your app's event log");
console.log(await call("hedera_create_topic", { memo: "my-app events" }));

step(4, "Inspect any built transaction before you sign it");
const tx = await call("hedera_transfer_hbar", { toAccountId: "0.0.98", amountHbar: 5 });
const b64 = tx.split("Transaction (base64):\n")[1]?.trim();
console.log(await call("hedera_decode_transaction", { transactionBase64: b64 }));

console.log("\n=== From zero to token + topic + reviewed transfer — in one AI session. ===");
await mcp.close();
process.exit(0);
