// Verify MCP resources: list them, read a static one and a templated one (live testnet).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...process.env, HEDERA_NETWORK: "testnet" } });
const mcp = new Client({ name: "res", version: "0.0.0" }, { capabilities: {} });
await mcp.connect(transport);

const { resources } = await mcp.listResources();
const { resourceTemplates } = await mcp.listResourceTemplates();
console.log("static resources:", resources.map((r) => r.uri).join(", "));
console.log("templated resources:", (resourceTemplates || []).map((r) => r.uriTemplate).join(", "));

const rate = await mcp.readResource({ uri: "hedera://network/exchange-rate" });
console.log("\nread hedera://network/exchange-rate →", rate.contents[0].text.slice(0, 70).replace(/\s+/g, " "));

// templated read — tolerate transient Mirror Node 5xx with one retry
async function readAcct() {
  for (let i = 0; i < 3; i++) {
    try {
      const a = await mcp.readResource({ uri: "hedera://account/0.0.98" });
      return a.contents[0].text.slice(0, 70).replace(/\s+/g, " ");
    } catch (e) {
      if (i === 2) return `(mirror transient: ${String(e.message).slice(0, 40)})`;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}
console.log("read hedera://account/0.0.98 →", await readAcct());

await mcp.close();
console.log("\nRESOURCES_OK");
process.exit(0);
