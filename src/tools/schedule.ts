/** Scheduled transactions: wrap an inner transfer for multi-party / threshold signing. */
import { z } from "zod";
import {
  AccountId,
  Hbar,
  PublicKey,
  ScheduleCreateTransaction,
  ScheduleDeleteTransaction,
  ScheduleId,
  ScheduleSignTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";
import type { Register } from "../types.js";
import { HederaCtx, json } from "../context.js";

export function registerScheduleTools(register: Register, ctx: HederaCtx): void {
  register(
    "hedera_create_schedule",
    "Build (unsigned) a scheduled HBAR transfer — wraps an inner transfer so multiple parties can sign before it executes.",
    {
      toAccountId: z.string().describe("Recipient of the scheduled transfer"),
      amountHbar: z.number().positive().describe("Amount in HBAR"),
      fromAccountId: z.string().optional().describe("Sender (defaults to payer)"),
      adminKey: z.string().optional().describe("Admin public key (enables schedule deletion)"),
      schedulePayerAccountId: z.string().optional().describe("Account that pays when the schedule executes"),
      memo: z.string().optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const from = AccountId.fromString(a.fromAccountId ?? ctx.payer(a.payerAccountId).toString());
      // Inner transaction MUST be unfrozen for ScheduleCreate to accept it.
      const inner = new TransferTransaction()
        .addHbarTransfer(from, new Hbar(-a.amountHbar))
        .addHbarTransfer(AccountId.fromString(a.toAccountId), new Hbar(a.amountHbar));
      const tx = new ScheduleCreateTransaction().setScheduledTransaction(inner);
      if (a.adminKey) tx.setAdminKey(PublicKey.fromString(a.adminKey));
      if (a.schedulePayerAccountId) tx.setPayerAccountId(a.schedulePayerAccountId);
      if (a.memo) tx.setScheduleMemo(a.memo);
      return ctx.buildAndRender(
        tx,
        `Create scheduled transfer ${a.amountHbar} ℏ · ${from} → ${a.toAccountId}`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_sign_schedule",
    "Build (unsigned) a signature add to an existing scheduled transaction.",
    { scheduleId: z.string(), payerAccountId: z.string().optional() },
    async (a) => {
      const tx = new ScheduleSignTransaction().setScheduleId(ScheduleId.fromString(a.scheduleId));
      return ctx.buildAndRender(tx, `Sign schedule ${a.scheduleId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_delete_schedule",
    "Build (unsigned) a deletion of a scheduled transaction (requires admin key).",
    { scheduleId: z.string(), payerAccountId: z.string().optional() },
    async (a) => {
      const tx = new ScheduleDeleteTransaction().setScheduleId(ScheduleId.fromString(a.scheduleId));
      return ctx.buildAndRender(tx, `Delete schedule ${a.scheduleId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_get_schedule_info",
    "Read scheduled-transaction info (signatures, executed status) from the Mirror Node.",
    { scheduleId: z.string() },
    async (a) => json(await ctx.mirror(`/api/v1/schedules/${encodeURIComponent(a.scheduleId)}`)),
  );
}
