// Simulated agent session — prints a natural-language → tool-call → unsigned-tx
// transcript over the real MCP server (build-only, no key needed). Mirrors what
// a user sees in Claude Desktop. Run: node examples/agent-sim.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node", args: ["dist/index.js"],
  env: { ...process.env, HEDERA_NETWORK: "testnet", HEDERA_OPERATOR_ID: "0.0.1001" },
});
const mcp = new Client({ name: "agent-sim", version: "0.0.0" }, { capabilities: {} });
await mcp.connect(transport);

const G = "\x1b[32m", D = "\x1b[2m", B = "\x1b[1m", R = "\x1b[0m", C = "\x1b[36m";
const user = (t) => console.log(`\n${B}🧑 User:${R} ${t}`);
async function call(tool, args, why) {
  console.log(`${C}   ⚙ ${tool}${R} ${D}${JSON.stringify(args)}${R}`);
  const text = (await mcp.callTool({ name: tool, arguments: args })).content[0].text;
  const first = text.split("\n").find((l) => l.includes("Built") || l.startsWith("{") || l.includes("current_rate")) || text.split("\n")[0];
  console.log(`     ${G}→ ${first.slice(0, 88)}${R}`);
}

console.log(`${B}=== hedera-mcp · simulated agent session (build-only) ===${R}`);

user("What's the HBAR exchange rate and the latest block?");
console.log(`${D}🤖 Reading live network state…${R}`);
await call("hedera_get_exchange_rate", {});
await call("hedera_get_blocks", { limit: 1 });

user("Create a loyalty token 'DemoPoints' (DEMO), 1,000,000 supply, 2 decimals.");
console.log(`${D}🤖 Building the token-create transaction for you to sign…${R}`);
await call("hedera_create_fungible_token", { name: "DemoPoints", symbol: "DEMO", decimals: 2, initialSupply: 1000000 });

user("Airdrop 250 DEMO to 0.0.98 and log it to a new consensus topic.");
console.log(`${D}🤖 Chaining airdrop + topic + message…${R}`);
await call("hedera_token_airdrop", { tokenId: "0.0.1234", toAccountId: "0.0.98", amount: 250 });
await call("hedera_create_topic", { memo: "loyalty events" });
await call("hedera_submit_message", { topicId: "0.0.1234", message: "first airdrop: 250 DEMO → 0.0.98" });

console.log(`\n${B}🤖 Done.${R} Built 4 unsigned transactions — sign them in your wallet to execute.`);
console.log(`${D}   The server never saw a private key.${R}`);
await mcp.close();
process.exit(0);
