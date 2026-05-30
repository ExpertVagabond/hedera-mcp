/** Smart contract service (EVM). Writes are build-only; reads use Mirror Node eth_call.
 *
 * Contract calls are ABI-aware: pass { abi, functionName, args } and the tool encodes
 * the calldata (and decodes read results) via viem — no hand-encoded hex required.
 * Raw `dataHex` / `functionParametersBase64` remain supported as a fallback. */
import { z } from "zod";
import { type Abi, decodeFunctionResult, encodeFunctionData } from "viem";
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

// Coerce JSON args to the types viem expects, based on the function's ABI inputs
// (integers → BigInt, bool strings → boolean). Addresses/strings pass through.
function coerceArgs(abi: any[], functionName: string, args: any[] = []): any[] {
  const fn = abi.find((x) => x?.type === "function" && x?.name === functionName);
  const inputs = fn?.inputs ?? [];
  return args.map((v, i) => {
    const t: string = inputs[i]?.type ?? "";
    if (/^u?int\d*$/.test(t) && !Array.isArray(v)) return BigInt(v as any);
    if (t === "bool") return typeof v === "boolean" ? v : v === "true";
    return v;
  });
}

// BigInt-safe JSON (decoded results often contain bigints).
function abiJson(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val), 2);
}

const ABI_FIELDS = {
  abi: z.array(z.any()).optional().describe("Contract ABI (JSON array) — enables auto encode/decode"),
  functionName: z.string().optional().describe("Function name to call (used with abi)"),
  args: z.array(z.any()).optional().describe("Function arguments (used with abi)"),
};

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
    "Build (unsigned) a state-changing contract call. Pass { abi, functionName, args } for automatic encoding, or raw functionParametersBase64.",
    {
      contractId: z.string().describe("Contract id (0.0.x) or EVM address"),
      gas: z.number().int().positive(),
      ...ABI_FIELDS,
      functionParametersBase64: z
        .string()
        .optional()
        .describe("Fallback: ABI-encoded calldata (selector + args) as base64"),
      payableAmountHbar: z.number().optional().describe("HBAR to send with the call"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      let params: Buffer;
      if (a.abi && a.functionName) {
        const hex = encodeFunctionData({
          abi: a.abi as Abi,
          functionName: a.functionName,
          args: coerceArgs(a.abi, a.functionName, a.args),
        });
        params = Buffer.from(hex.slice(2), "hex");
      } else if (a.functionParametersBase64) {
        params = Buffer.from(a.functionParametersBase64, "base64");
      } else {
        throw new Error("Provide either { abi, functionName, args? } or functionParametersBase64.");
      }
      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(a.contractId))
        .setGas(a.gas)
        .setFunctionParameters(params);
      if (a.payableAmountHbar != null) tx.setPayableAmount(new Hbar(a.payableAmountHbar));
      const label = a.functionName ? `${a.functionName}()` : "calldata";
      return ctx.buildAndRender(tx, `Execute contract ${a.contractId} · ${label} · gas ${a.gas}`, a.payerAccountId);
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
    "Read a contract view/pure function via Mirror Node eth_call (keyless, no gas). Pass { abi, functionName, args } for auto encode/decode, or raw dataHex.",
    {
      contractIdOrAddress: z.string().describe("Contract id (0.0.x) or 0x EVM address"),
      ...ABI_FIELDS,
      dataHex: z.string().optional().describe("Fallback: ABI-encoded calldata as 0x-prefixed hex"),
      fromAddress: z.string().optional().describe("Optional 0x caller address"),
    },
    async (a) => {
      let data: string;
      if (a.abi && a.functionName) {
        data = encodeFunctionData({
          abi: a.abi as Abi,
          functionName: a.functionName,
          args: coerceArgs(a.abi, a.functionName, a.args),
        });
      } else if (a.dataHex) {
        data = a.dataHex.startsWith("0x") ? a.dataHex : `0x${a.dataHex}`;
      } else {
        throw new Error("Provide either { abi, functionName, args? } or dataHex.");
      }
      const body: Record<string, unknown> = { to: a.contractIdOrAddress, data, estimate: false };
      if (a.fromAddress) body.from = a.fromAddress;
      const res: any = await ctx.mirrorPost(`/api/v1/contracts/call`, body);
      if (a.abi && a.functionName && res?.result) {
        const decoded = decodeFunctionResult({
          abi: a.abi as Abi,
          functionName: a.functionName,
          data: res.result as `0x${string}`,
        });
        return abiJson({ function: a.functionName, result: res.result, decoded });
      }
      return abiJson(res);
    },
  );

  register(
    "hedera_get_contract_info",
    "Read contract info (admin key, bytecode metadata, EVM address) from the Mirror Node.",
    { contractId: z.string() },
    async (a) => json(await ctx.mirror(`/api/v1/contracts/${encodeURIComponent(a.contractId)}`)),
  );
}
