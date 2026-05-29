/** File service: create / append / update / delete files (e.g. contract bytecode).
 *
 * Note: file *contents/info* require a paid consensus query (FileContentsQuery),
 * which is incompatible with this server's keyless posture — so there is no
 * Mirror Node-based file read tool. */
import { z } from "zod";
import {
  FileAppendTransaction,
  FileCreateTransaction,
  FileDeleteTransaction,
  FileId,
  FileUpdateTransaction,
  PublicKey,
} from "@hashgraph/sdk";
import type { Register } from "../types.js";
import { HederaCtx } from "../context.js";

export function registerFileTools(register: Register, ctx: HederaCtx): void {
  register(
    "hedera_create_file",
    "Build (unsigned) a new file. Useful for storing compiled contract bytecode before deployment.",
    {
      contents: z.string().describe("File contents (UTF-8 text or hex bytecode)"),
      key: z.string().optional().describe("Public key controlling the file (enables append/update/delete)"),
      memo: z.string().optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new FileCreateTransaction().setContents(a.contents);
      if (a.key) tx.setKeys([PublicKey.fromString(a.key)]);
      if (a.memo) tx.setFileMemo(a.memo);
      return ctx.buildAndRender(tx, `Create file (${Buffer.from(a.contents).length} bytes)`, a.payerAccountId);
    },
  );

  register(
    "hedera_append_file",
    "Build (unsigned) an append to an existing file (for bytecode larger than one transaction).",
    { fileId: z.string(), contents: z.string(), payerAccountId: z.string().optional() },
    async (a) => {
      const tx = new FileAppendTransaction()
        .setFileId(FileId.fromString(a.fileId))
        .setContents(a.contents);
      return ctx.buildAndRender(
        tx,
        `Append ${Buffer.from(a.contents).length} bytes to file ${a.fileId}`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_update_file",
    "Build (unsigned) an update that replaces a file's contents and/or memo.",
    {
      fileId: z.string(),
      contents: z.string().optional(),
      memo: z.string().optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new FileUpdateTransaction().setFileId(FileId.fromString(a.fileId));
      if (a.contents != null) tx.setContents(a.contents);
      if (a.memo != null) tx.setFileMemo(a.memo);
      return ctx.buildAndRender(tx, `Update file ${a.fileId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_delete_file",
    "Build (unsigned) a file deletion.",
    { fileId: z.string(), payerAccountId: z.string().optional() },
    async (a) => {
      const tx = new FileDeleteTransaction().setFileId(FileId.fromString(a.fileId));
      return ctx.buildAndRender(tx, `Delete file ${a.fileId}`, a.payerAccountId);
    },
  );
}
