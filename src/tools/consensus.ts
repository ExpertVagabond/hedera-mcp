/** Consensus service (HCS): topics + messages. Reads via Mirror Node. */
import { z } from "zod";
import {
  PublicKey,
  TopicCreateTransaction,
  TopicDeleteTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
} from "@hashgraph/sdk";
import type { Register } from "../types.js";
import { HederaCtx, json } from "../context.js";

export function registerConsensusTools(register: Register, ctx: HederaCtx): void {
  register(
    "hedera_create_topic",
    "Build (unsigned) a new HCS topic for ordered, timestamped messages.",
    {
      memo: z.string().optional().describe("Topic memo"),
      adminKey: z.string().optional().describe("Admin public key (enables update/delete)"),
      submitKey: z.string().optional().describe("Submit public key (restricts who can post)"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new TopicCreateTransaction();
      if (a.memo) tx.setTopicMemo(a.memo);
      if (a.adminKey) tx.setAdminKey(PublicKey.fromString(a.adminKey));
      if (a.submitKey) tx.setSubmitKey(PublicKey.fromString(a.submitKey));
      return ctx.buildAndRender(tx, `Create HCS topic${a.memo ? ` · "${a.memo}"` : ""}`, a.payerAccountId);
    },
  );

  register(
    "hedera_submit_message",
    "Build (unsigned) a message submission to an HCS topic.",
    {
      topicId: z.string(),
      message: z.string().describe("UTF-8 message payload"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(a.topicId))
        .setMessage(a.message);
      return ctx.buildAndRender(
        tx,
        `Submit message to ${a.topicId} (${Buffer.from(a.message).length} bytes)`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_update_topic",
    "Build (unsigned) an update to an HCS topic memo.",
    { topicId: z.string(), memo: z.string(), payerAccountId: z.string().optional() },
    async (a) => {
      const tx = new TopicUpdateTransaction().setTopicId(TopicId.fromString(a.topicId)).setTopicMemo(a.memo);
      return ctx.buildAndRender(tx, `Update topic ${a.topicId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_delete_topic",
    "Build (unsigned) a deletion of an HCS topic (requires admin key).",
    { topicId: z.string(), payerAccountId: z.string().optional() },
    async (a) => {
      const tx = new TopicDeleteTransaction().setTopicId(TopicId.fromString(a.topicId));
      return ctx.buildAndRender(tx, `Delete topic ${a.topicId}`, a.payerAccountId);
    },
  );

  // ---- Mirror Node reads (keyless) ----

  register(
    "hedera_get_topic_info",
    "Read HCS topic info from the Mirror Node.",
    { topicId: z.string() },
    async (a) => json(await ctx.mirror(`/api/v1/topics/${encodeURIComponent(a.topicId)}`)),
  );

  register(
    "hedera_get_topic_messages",
    "Read recent messages from an HCS topic via the Mirror Node (decodes base64 payloads).",
    {
      topicId: z.string(),
      limit: z.number().int().min(1).max(100).optional().describe("Max messages (default 25)"),
    },
    async (a) => {
      const data: any = await ctx.mirror(
        `/api/v1/topics/${encodeURIComponent(a.topicId)}/messages?limit=${a.limit ?? 25}&order=desc`,
      );
      const messages = (data.messages ?? []).map((m: any) => ({
        sequence_number: m.sequence_number,
        consensus_timestamp: m.consensus_timestamp,
        message: m.message ? Buffer.from(m.message, "base64").toString("utf8") : null,
      }));
      return json({ topicId: a.topicId, count: messages.length, messages });
    },
  );
}
