/** Scheduled transactions: wrap a build-only inner transaction for multi-party signing. */
import { z } from "zod";
import {
  PublicKey,
  ScheduleCreateTransaction,
  ScheduleDeleteTransaction,
  ScheduleId,
  ScheduleSignTransaction,
  Transaction,
} from "@hashgraph/sdk";
import type { Register } from "../types.js";
import { HederaCtx, json } from "../context.js";

export function registerScheduleTools(register: Register, ctx: HederaCtx): void {
  register(
    "hedera_create_schedule",
    "Build (unsigned) a scheduled transaction wrapping an inner transaction (provided as base64 bytes). Enables multi-party / threshold signing before execution.",
    {
      scheduledTransactionBase64: z
        .string()
        .describe("Inner transaction bytes (base64) produced by another build tool"),
      adminKey: z.string().optional().describe("Admin public key (enables schedule deletion)"),
      schedulePayerAccountId: z.string().optional().describe("Account that pays when the schedule executes"),
      memo: z.string().optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const inner = Transaction.fromBytes(Buffer.from(a.scheduledTransactionBase64, "base64"));
      const tx = new ScheduleCreateTransaction().setScheduledTransaction(inner);
      if (a.adminKey) tx.setAdminKey(PublicKey.fromString(a.adminKey));
      if (a.schedulePayerAccountId) tx.setPayerAccountId(a.schedulePayerAccountId);
      if (a.memo) tx.setScheduleMemo(a.memo);
      return ctx.buildAndRender(tx, `Create schedule wrapping ${inner.constructor.name}`, a.payerAccountId);
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
