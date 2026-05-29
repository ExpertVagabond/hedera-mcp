/** Network/utility tools: transactions, nodes, fees, supply, exchange rate, and tx decoding. */
import { z } from "zod";
import { Transaction } from "@hashgraph/sdk";
import type { Register } from "../types.js";
import { HederaCtx, json, resolveTxType } from "../context.js";

export function registerNetworkTools(register: Register, ctx: HederaCtx): void {
  register(
    "hedera_get_transaction",
    "Read a transaction's records/results from the Mirror Node by transaction id.",
    { transactionId: z.string().describe("e.g. 0.0.1234-1700000000-000000000 or 0.0.1234@1700000000.0") },
    async (a) => {
      // Mirror Node expects 0.0.x-seconds-nanos
      const id = a.transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
      return json(await ctx.mirror(`/api/v1/transactions/${encodeURIComponent(id)}`));
    },
  );

  register(
    "hedera_get_network_nodes",
    "List the network's consensus nodes and stake from the Mirror Node.",
    {},
    async () => json(await ctx.mirror(`/api/v1/network/nodes?limit=50`)),
  );

  register(
    "hedera_get_exchange_rate",
    "Read the current HBAR↔USD exchange rate from the Mirror Node.",
    {},
    async () => json(await ctx.mirror(`/api/v1/network/exchangerate`)),
  );

  register(
    "hedera_get_network_supply",
    "Read total/circulating HBAR supply from the Mirror Node.",
    {},
    async () => json(await ctx.mirror(`/api/v1/network/supply`)),
  );

  register(
    "hedera_get_network_fees",
    "Read the current network fee schedule from the Mirror Node.",
    {},
    async () => json(await ctx.mirror(`/api/v1/network/fees`)),
  );

  register(
    "hedera_decode_transaction",
    "Decode a base64 transaction (e.g. one built by this server) into a human-readable summary — useful for review before signing.",
    { transactionBase64: z.string().describe("Base64 transaction bytes") },
    async (a) => {
      const tx = Transaction.fromBytes(Buffer.from(a.transactionBase64, "base64"));
      return json({
        type: resolveTxType(tx),
        transactionId: tx.transactionId?.toString() ?? null,
        nodeAccountIds: tx.nodeAccountIds?.map((n) => n.toString()) ?? null,
        transactionMemo: tx.transactionMemo || null,
        maxTransactionFee: tx.maxTransactionFee?.toString() ?? null,
      });
    },
  );
}
