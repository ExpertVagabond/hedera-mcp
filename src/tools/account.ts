/** Account service: create, transfer, update, delete, allowances, and Mirror Node reads. */
import { z } from "zod";
import {
  AccountAllowanceApproveTransaction,
  AccountCreateTransaction,
  AccountDeleteTransaction,
  AccountId,
  AccountUpdateTransaction,
  Hbar,
  PublicKey,
  TransferTransaction,
} from "@hashgraph/sdk";
import type { Register } from "../types.js";
import { HederaCtx, json } from "../context.js";

export function registerAccountTools(register: Register, ctx: HederaCtx): void {
  register(
    "hedera_create_account",
    "Build (unsigned) a new Hedera account with a given public key and optional initial HBAR balance.",
    {
      publicKey: z.string().describe("ED25519 or ECDSA public key (DER or hex) controlling the new account"),
      initialBalanceHbar: z.number().optional().describe("Initial balance in HBAR (default 0)"),
      memo: z.string().optional().describe("Account memo"),
      maxAutomaticTokenAssociations: z.number().int().optional().describe("Auto token-association slots"),
      payerAccountId: z.string().optional().describe("Payer (defaults to HEDERA_OPERATOR_ID)"),
    },
    async (a) => {
      const tx = new AccountCreateTransaction().setKey(PublicKey.fromString(a.publicKey));
      if (a.initialBalanceHbar != null) tx.setInitialBalance(new Hbar(a.initialBalanceHbar));
      if (a.memo) tx.setAccountMemo(a.memo);
      if (a.maxAutomaticTokenAssociations != null)
        tx.setMaxAutomaticTokenAssociations(a.maxAutomaticTokenAssociations);
      return ctx.buildAndRender(
        tx,
        `Create account · key ${a.publicKey.slice(0, 16)}… · ${a.initialBalanceHbar ?? 0} ℏ`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_transfer_hbar",
    "Build (unsigned) an HBAR transfer from one account to another.",
    {
      fromAccountId: z.string().optional().describe("Sender (defaults to payer)"),
      toAccountId: z.string().describe("Recipient account id, e.g. 0.0.1234"),
      amountHbar: z.number().positive().describe("Amount in HBAR"),
      memo: z.string().optional().describe("Transaction memo"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const from = AccountId.fromString(a.fromAccountId ?? ctx.payer(a.payerAccountId).toString());
      const to = AccountId.fromString(a.toAccountId);
      const tx = new TransferTransaction()
        .addHbarTransfer(from, new Hbar(-a.amountHbar))
        .addHbarTransfer(to, new Hbar(a.amountHbar));
      if (a.memo) tx.setTransactionMemo(a.memo);
      return ctx.buildAndRender(tx, `Transfer ${a.amountHbar} ℏ · ${from} → ${to}`, a.payerAccountId);
    },
  );

  register(
    "hedera_update_account",
    "Build (unsigned) an account update (memo, auto-association slots).",
    {
      accountId: z.string().describe("Account to update"),
      memo: z.string().optional(),
      maxAutomaticTokenAssociations: z.number().int().optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new AccountUpdateTransaction().setAccountId(AccountId.fromString(a.accountId));
      if (a.memo != null) tx.setAccountMemo(a.memo);
      if (a.maxAutomaticTokenAssociations != null)
        tx.setMaxAutomaticTokenAssociations(a.maxAutomaticTokenAssociations);
      return ctx.buildAndRender(tx, `Update account ${a.accountId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_delete_account",
    "Build (unsigned) an account deletion, transferring the remaining balance to another account.",
    {
      accountId: z.string().describe("Account to delete"),
      transferAccountId: z.string().describe("Account that receives the remaining balance"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new AccountDeleteTransaction()
        .setAccountId(AccountId.fromString(a.accountId))
        .setTransferAccountId(AccountId.fromString(a.transferAccountId));
      return ctx.buildAndRender(
        tx,
        `Delete account ${a.accountId} → balance to ${a.transferAccountId}`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_approve_hbar_allowance",
    "Build (unsigned) an HBAR allowance granting a spender the right to spend from an owner account.",
    {
      ownerAccountId: z.string().optional().describe("Owner (defaults to payer)"),
      spenderAccountId: z.string().describe("Spender granted the allowance"),
      amountHbar: z.number().positive().describe("Allowance amount in HBAR"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const owner = AccountId.fromString(a.ownerAccountId ?? ctx.payer(a.payerAccountId).toString());
      const tx = new AccountAllowanceApproveTransaction().approveHbarAllowance(
        owner,
        AccountId.fromString(a.spenderAccountId),
        new Hbar(a.amountHbar),
      );
      return ctx.buildAndRender(
        tx,
        `Approve ${a.amountHbar} ℏ allowance · ${owner} → ${a.spenderAccountId}`,
        a.payerAccountId,
      );
    },
  );

  // ---- Mirror Node reads (keyless) ----

  register(
    "hedera_get_account_info",
    "Read full account info (key, balance, memo, auto-renew, associations) from the Mirror Node.",
    { accountId: z.string().describe("Account id or EVM address") },
    async (a) => json(await ctx.mirror(`/api/v1/accounts/${encodeURIComponent(a.accountId)}`)),
  );

  register(
    "hedera_get_account_balance",
    "Read an account's HBAR and token balances from the Mirror Node.",
    { accountId: z.string().describe("Account id or EVM address") },
    async (a) =>
      json(await ctx.mirror(`/api/v1/accounts/${encodeURIComponent(a.accountId)}/tokens?limit=100`)),
  );

  register(
    "hedera_get_account_nfts",
    "List NFTs owned by an account from the Mirror Node.",
    {
      accountId: z.string().describe("Account id"),
      limit: z.number().int().min(1).max(100).optional().describe("Max NFTs (default 25)"),
    },
    async (a) =>
      json(
        await ctx.mirror(
          `/api/v1/accounts/${encodeURIComponent(a.accountId)}/nfts?limit=${a.limit ?? 25}`,
        ),
      ),
  );
}
