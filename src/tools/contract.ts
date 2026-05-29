/** Smart contract service (EVM). Writes are build-only; reads use Mirror Node eth_call. */
import { z } from "zod";
import {
  AccountId,
  ContractCreateTransaction,
  ContractDeleteTransaction,
  ContractExecuteTransaction,
  ContractId,
  ContractUpdateTransaction,
  FileId,
  Hbar,
} from "@hashgraph/sdk";
import type { Register } from "../types.js";
import { HederaCtx, json } from "../context.js";

export function registerContractTools(register: Register, ctx: HederaCtx): void {
  register(
    "hedera_deploy_contract",
    "Build (unsigned) a contract deployment from bytecode already stored in a Hedera File (see hedera_create_file).",
    {
      bytecodeFileId: z.string().describe("File id holding the compiled bytecode (hex)"),
      gas: z.number().int().positive().describe("Gas limit, e.g. 100000"),
      initialBalanceHbar: z.number().optional().describe("Initial contract balance in HBAR"),
      constructorParamsBase64: z
        .string()
        .optional()
        .describe("ABI-encoded constructor params as base64 (omit if none)"),
      adminKey: z.string().optional().describe("Admin public key for the contract"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new ContractCreateTransaction()
        .setBytecodeFileId(FileId.fromString(a.bytecodeFileId))
        .setGas(a.gas);
      if (a.initialBalanceHbar != null) tx.setInitialBalance(new Hbar(a.initialBalanceHbar));
      if (a.constructorParamsBase64)
        tx.setConstructorParameters(Buffer.from(a.constructorParamsBase64, "base64"));
      return ctx.buildAndRender(
        tx,
        `Deploy contract from file ${a.bytecodeFileId} · gas ${a.gas}`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_execute_contract",
    "Build (unsigned) a state-changing contract call. Provide ABI-encoded calldata as base64.",
    {
      contractId: z.string().describe("Contract id (0.0.x) or EVM address"),
      gas: z.number().int().positive(),
      functionParametersBase64: z
        .string()
        .describe("ABI-encoded calldata (selector + args) as base64"),
      payableAmountHbar: z.number().optional().describe("HBAR to send with the call"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(a.contractId))
        .setGas(a.gas)
        .setFunctionParameters(Buffer.from(a.functionParametersBase64, "base64"));
      if (a.payableAmountHbar != null) tx.setPayableAmount(new Hbar(a.payableAmountHbar));
      return ctx.buildAndRender(tx, `Execute contract ${a.contractId} · gas ${a.gas}`, a.payerAccountId);
    },
  );

  register(
    "hedera_update_contract",
    "Build (unsigned) an update to a contract's memo or admin key (requires admin key to sign).",
    {
      contractId: z.string(),
      memo: z.string().optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new ContractUpdateTransaction().setContractId(ContractId.fromString(a.contractId));
      if (a.memo != null) tx.setContractMemo(a.memo);
      return ctx.buildAndRender(tx, `Update contract ${a.contractId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_delete_contract",
    "Build (unsigned) a contract deletion, transferring any balance to an account.",
    {
      contractId: z.string(),
      transferAccountId: z.string().describe("Account that receives the contract's remaining balance"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new ContractDeleteTransaction()
        .setContractId(ContractId.fromString(a.contractId))
        .setTransferAccountId(AccountId.fromString(a.transferAccountId));
      return ctx.buildAndRender(tx, `Delete contract ${a.contractId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_query_contract",
    "Read a contract view/pure function via the Mirror Node eth_call endpoint (keyless, no gas spent).",
    {
      contractIdOrAddress: z.string().describe("Contract id (0.0.x) or 0x EVM address"),
      dataHex: z.string().describe("ABI-encoded calldata as 0x-prefixed hex"),
      fromAddress: z.string().optional().describe("Optional 0x caller address"),
    },
    async (a) => {
      const body: Record<string, unknown> = {
        to: a.contractIdOrAddress,
        data: a.dataHex.startsWith("0x") ? a.dataHex : `0x${a.dataHex}`,
        estimate: false,
      };
      if (a.fromAddress) body.from = a.fromAddress;
      return json(await ctx.mirrorPost(`/api/v1/contracts/call`, body));
    },
  );

  register(
    "hedera_get_contract_info",
    "Read contract info (admin key, bytecode metadata, EVM address) from the Mirror Node.",
    { contractId: z.string() },
    async (a) => json(await ctx.mirror(`/api/v1/contracts/${encodeURIComponent(a.contractId)}`)),
  );
}
