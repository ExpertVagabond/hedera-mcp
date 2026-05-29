/** MCP resources — addressable, keyless Hedera state agents can read by URI
 * (complements the tools). All back the public Mirror Node. */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HederaCtx, json } from "./context.js";

export function registerResources(server: McpServer, ctx: HederaCtx): number {
  let n = 0;
  const text = async (uri: URL, path: string) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: json(await ctx.mirror(path)) }],
  });

  server.registerResource(
    "network-exchange-rate",
    "hedera://network/exchange-rate",
    { title: "HBAR exchange rate", description: "Current HBAR↔USD rate", mimeType: "application/json" },
    async (uri) => text(uri, `/api/v1/network/exchangerate`),
  );
  n++;

  server.registerResource(
    "network-supply",
    "hedera://network/supply",
    { title: "HBAR supply", description: "Total / circulating HBAR", mimeType: "application/json" },
    async (uri) => text(uri, `/api/v1/network/supply`),
  );
  n++;

  server.registerResource(
    "account",
    new ResourceTemplate("hedera://account/{accountId}", { list: undefined }),
    { title: "Hedera account", description: "Account info by id or EVM address", mimeType: "application/json" },
    async (uri, vars) => text(uri, `/api/v1/accounts/${encodeURIComponent(String(vars.accountId))}`),
  );
  n++;

  server.registerResource(
    "token",
    new ResourceTemplate("hedera://token/{tokenId}", { list: undefined }),
    { title: "Hedera token", description: "Token info by id", mimeType: "application/json" },
    async (uri, vars) => text(uri, `/api/v1/tokens/${encodeURIComponent(String(vars.tokenId))}`),
  );
  n++;

  return n;
}
