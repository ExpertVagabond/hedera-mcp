/** Analytics: keyless Mirror Node reads — blocks, balances, allowances, contract data, staking. */
import { z } from "zod";
import type { Register } from "../types.js";
import { HederaCtx, json } from "../context.js";

export function registerAnalyticsTools(register: Register, ctx: HederaCtx): void {
  register(
    "hedera_get_block",
    "Read a block by number or hash from the Mirror Node.",
    { numberOrHash: z.string().describe("Block number or hash") },
    async (a) => json(await ctx.mirror(`/api/v1/blocks/${encodeURIComponent(a.numberOrHash)}`)),
  );

  register(
    "hedera_get_blocks",
    "List recent blocks from the Mirror Node.",
    { limit: z.number().int().min(1).max(100).optional() },
    async (a) => json(await ctx.mirror(`/api/v1/blocks?limit=${a.limit ?? 10}&order=desc`)),
  );

  register(
    "hedera_get_account_transactions",
    "List recent transactions for an account from the Mirror Node.",
    { accountId: z.string(), limit: z.number().int().min(1).max(100).optional() },
    async (a) =>
      json(
        await ctx.mirror(
          `/api/v1/transactions?account.id=${encodeURIComponent(a.accountId)}&limit=${a.limit ?? 25}&order=desc`,
        ),
      ),
  );

  register(
    "hedera_get_token_balances",
    "List the accounts holding a token and their balances, from the Mirror Node.",
    { tokenId: z.string(), limit: z.number().int().min(1).max(100).optional() },
    async (a) =>
      json(await ctx.mirror(`/api/v1/tokens/${encodeURIComponent(a.tokenId)}/balances?limit=${a.limit ?? 25}`)),
  );

  register(
    "hedera_get_token_nfts",
    "List the minted NFTs (serials) of an NFT collection from the Mirror Node.",
    { tokenId: z.string(), limit: z.number().int().min(1).max(100).optional() },
    async (a) =>
      json(await ctx.mirror(`/api/v1/tokens/${encodeURIComponent(a.tokenId)}/nfts?limit=${a.limit ?? 25}`)),
  );

  register(
    "hedera_get_nft_history",
    "Read the transfer/mint history of a specific NFT serial from the Mirror Node.",
    { tokenId: z.string(), serial: z.number().int().positive() },
    async (a) =>
      json(
        await ctx.mirror(
          `/api/v1/tokens/${encodeURIComponent(a.tokenId)}/nfts/${a.serial}/transactions?limit=25`,
        ),
      ),
  );

  register(
    "hedera_get_account_allowances",
    "Read an account's active HBAR (crypto) allowances from the Mirror Node.",
    { accountId: z.string() },
    async (a) =>
      json(await ctx.mirror(`/api/v1/accounts/${encodeURIComponent(a.accountId)}/allowances/crypto?limit=25`)),
  );

  register(
    "hedera_get_account_token_allowances",
    "Read an account's active fungible-token allowances from the Mirror Node.",
    { accountId: z.string() },
    async (a) =>
      json(await ctx.mirror(`/api/v1/accounts/${encodeURIComponent(a.accountId)}/allowances/tokens?limit=25`)),
  );

  register(
    "hedera_get_account_nft_allowances",
    "Read an account's active NFT (approve-for-all) allowances from the Mirror Node.",
    { accountId: z.string() },
    async (a) =>
      json(await ctx.mirror(`/api/v1/accounts/${encodeURIComponent(a.accountId)}/allowances/nfts?limit=25`)),
  );

  register(
    "hedera_get_contract_results",
    "List recent execution results for a contract from the Mirror Node.",
    { contractId: z.string(), limit: z.number().int().min(1).max(100).optional() },
    async (a) =>
      json(
        await ctx.mirror(
          `/api/v1/contracts/${encodeURIComponent(a.contractId)}/results?limit=${a.limit ?? 10}&order=desc`,
        ),
      ),
  );

  register(
    "hedera_get_contract_state",
    "Read a contract's current storage slots from the Mirror Node.",
    { contractId: z.string(), limit: z.number().int().min(1).max(100).optional() },
    async (a) =>
      json(await ctx.mirror(`/api/v1/contracts/${encodeURIComponent(a.contractId)}/state?limit=${a.limit ?? 25}`)),
  );

  register(
    "hedera_get_network_stake",
    "Read network-wide staking info (total staked, reward rate) from the Mirror Node.",
    {},
    async () => json(await ctx.mirror(`/api/v1/network/stake`)),
  );

  register(
    "hedera_search_accounts_by_pubkey",
    "Find accounts controlled by a given public key from the Mirror Node.",
    { publicKey: z.string().describe("Public key (hex/DER)") },
    async (a) =>
      json(await ctx.mirror(`/api/v1/accounts?account.publickey=${encodeURIComponent(a.publicKey)}&limit=25`)),
  );

  register(
    "hedera_get_account_by_evm",
    "Resolve a Hedera account from a 0x EVM address via the Mirror Node.",
    { evmAddress: z.string().describe("0x-prefixed EVM address") },
    async (a) => json(await ctx.mirror(`/api/v1/accounts/${encodeURIComponent(a.evmAddress)}`)),
  );
}
