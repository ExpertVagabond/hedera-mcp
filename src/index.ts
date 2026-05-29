#!/usr/bin/env node
/**
 * Hedera MCP Server
 *
 * Comprehensive Model Context Protocol coverage for Hedera (Hashgraph):
 * Account, Token (HTS), Consensus (HCS), Smart Contract (EVM), File, Schedule,
 * and Network services.
 *
 * Security posture (matches goat-network-mcp): BUILD-ONLY, never holds keys.
 *  - Reads/queries hit the public Mirror Node REST API (no auth).
 *  - Writes build + freeze + serialize an UNSIGNED transaction (base64). The
 *    caller signs and submits with their own wallet/SDK/CLI. Nothing executes here.
 *
 * Environment:
 *   HEDERA_NETWORK      mainnet | testnet (default) | previewnet
 *   HEDERA_OPERATOR_ID  optional default payer/treasury ACCOUNT ID (not a key)
 *   HEDERA_MIRROR_URL   optional Mirror Node REST override
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HederaCtx } from "./context.js";
import type { Register } from "./types.js";
import { registerAccountTools } from "./tools/account.js";
import { registerTokenTools } from "./tools/token.js";
import { registerConsensusTools } from "./tools/consensus.js";
import { registerContractTools } from "./tools/contract.js";
import { registerFileTools } from "./tools/file.js";
import { registerScheduleTools } from "./tools/schedule.js";
import { registerNetworkTools } from "./tools/network.js";

const ctx = new HederaCtx();

const server = new McpServer({
  name: "hedera-mcp",
  version: "0.1.0",
});

let toolCount = 0;

const register: Register = (name, description, shape, handler) => {
  server.tool(name, description, shape as Record<string, z.ZodType>, async (args: any) => {
    try {
      const text = await handler(args);
      return { content: [{ type: "text" as const, text }] };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err?.message ?? String(err)}` }],
        isError: true,
      };
    }
  });
  toolCount++;
};

registerAccountTools(register, ctx);
registerTokenTools(register, ctx);
registerConsensusTools(register, ctx);
registerContractTools(register, ctx);
registerFileTools(register, ctx);
registerScheduleTools(register, ctx);
registerNetworkTools(register, ctx);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `hedera-mcp running — ${toolCount} tools — ${ctx.network.name} ` +
      `(mirror ${ctx.network.mirror})` +
      (ctx.operatorId ? ` — default payer ${ctx.operatorId.toString()}` : " — build-only, no default payer"),
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
