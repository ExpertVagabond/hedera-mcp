// Smoke test: spawn the server over MCP stdio, list tools, exercise a real
// Mirror Node read (testnet) and a build-only write. Run: node test-smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, HEDERA_NETWORK: "testnet", HEDERA_OPERATOR_ID: "0.0.1001" },
});

const client = new Client({ name: "smoke", version: "0.0.0" }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`TOOLS: ${tools.length}`);
console.log("NAMES:", tools.map((t) => t.name).join(", "));

// 1) Real keyless read against testnet Mirror Node
const rate = await client.callTool({ name: "hedera_get_exchange_rate", arguments: {} });
console.log("\n--- hedera_get_exchange_rate (live testnet) ---");
console.log(rate.content[0].text.slice(0, 240));

// 2) Build-only write -> should return unsigned base64
const xfer = await client.callTool({
  name: "hedera_transfer_hbar",
  arguments: { toAccountId: "0.0.98", amountHbar: 1.5, memo: "smoke" },
});
console.log("\n--- hedera_transfer_hbar (build-only) ---");
console.log(xfer.content[0].text.slice(0, 400));

// 3) Round-trip: decode the bytes we just built
const b64 = xfer.content[0].text.split("Transaction (base64):\n")[1]?.trim();
const decoded = await client.callTool({
  name: "hedera_decode_transaction",
  arguments: { transactionBase64: b64 },
});
console.log("\n--- hedera_decode_transaction (round-trip) ---");
console.log(decoded.content[0].text);

await client.close();
console.log("\nSMOKE_OK");
process.exit(0);
