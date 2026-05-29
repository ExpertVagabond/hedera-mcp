/**
 * HederaCtx — the keyless heart of the server.
 *
 * Design contract: this server NEVER holds, reads, or asks for a private key.
 *  - Read/query tools hit the public Mirror Node REST API (no auth).
 *  - Write tools BUILD a transaction, freeze it, and return the unsigned bytes
 *    (base64) plus a human summary. The caller signs & submits with their own
 *    wallet / SDK / CLI. Nothing is ever executed from here.
 *
 * The only optional input is HEDERA_OPERATOR_ID — an *account id* (not a key) —
 * used as the default payer/treasury when building transactions.
 */

import {
  AccountAllowanceApproveTransaction,
  AccountCreateTransaction,
  AccountDeleteTransaction,
  AccountId,
  AccountUpdateTransaction,
  Client,
  ContractCreateTransaction,
  ContractDeleteTransaction,
  ContractExecuteTransaction,
  ContractUpdateTransaction,
  FileAppendTransaction,
  FileCreateTransaction,
  FileDeleteTransaction,
  FileUpdateTransaction,
  PrngTransaction,
  ScheduleCreateTransaction,
  ScheduleDeleteTransaction,
  ScheduleSignTransaction,
  TokenAirdropTransaction,
  TokenAssociateTransaction,
  TokenBurnTransaction,
  TokenCreateTransaction,
  TokenDeleteTransaction,
  TokenDissociateTransaction,
  TokenFreezeTransaction,
  TokenGrantKycTransaction,
  TokenMintTransaction,
  TokenPauseTransaction,
  TokenRejectTransaction,
  TokenRevokeKycTransaction,
  TokenUnfreezeTransaction,
  TokenUnpauseTransaction,
  TokenUpdateTransaction,
  TokenWipeTransaction,
  TopicCreateTransaction,
  TopicDeleteTransaction,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
  Transaction,
  TransactionId,
  TransferTransaction,
} from "@hashgraph/sdk";
import { resolveNetwork, type NetworkConfig } from "./networks.js";

/**
 * Resolve a human-readable transaction type. The @hashgraph/sdk bundle is
 * minified, so `constructor.name` is mangled (e.g. "T") — we match by prototype
 * via instanceof, which is unaffected by minification.
 */
const TX_TYPES: Array<[new (...args: any[]) => Transaction, string]> = [
  [TransferTransaction, "TransferTransaction"],
  [AccountCreateTransaction, "AccountCreateTransaction"],
  [AccountUpdateTransaction, "AccountUpdateTransaction"],
  [AccountDeleteTransaction, "AccountDeleteTransaction"],
  [AccountAllowanceApproveTransaction, "AccountAllowanceApproveTransaction"],
  [TokenCreateTransaction, "TokenCreateTransaction"],
  [TokenMintTransaction, "TokenMintTransaction"],
  [TokenBurnTransaction, "TokenBurnTransaction"],
  [TokenAssociateTransaction, "TokenAssociateTransaction"],
  [TokenDissociateTransaction, "TokenDissociateTransaction"],
  [TokenFreezeTransaction, "TokenFreezeTransaction"],
  [TokenUnfreezeTransaction, "TokenUnfreezeTransaction"],
  [TokenGrantKycTransaction, "TokenGrantKycTransaction"],
  [TokenRevokeKycTransaction, "TokenRevokeKycTransaction"],
  [TokenPauseTransaction, "TokenPauseTransaction"],
  [TokenUnpauseTransaction, "TokenUnpauseTransaction"],
  [TokenWipeTransaction, "TokenWipeTransaction"],
  [TokenDeleteTransaction, "TokenDeleteTransaction"],
  [TokenUpdateTransaction, "TokenUpdateTransaction"],
  [TokenAirdropTransaction, "TokenAirdropTransaction"],
  [TokenRejectTransaction, "TokenRejectTransaction"],
  [TopicCreateTransaction, "TopicCreateTransaction"],
  [TopicMessageSubmitTransaction, "TopicMessageSubmitTransaction"],
  [TopicUpdateTransaction, "TopicUpdateTransaction"],
  [TopicDeleteTransaction, "TopicDeleteTransaction"],
  [ContractCreateTransaction, "ContractCreateTransaction"],
  [ContractExecuteTransaction, "ContractExecuteTransaction"],
  [ContractUpdateTransaction, "ContractUpdateTransaction"],
  [ContractDeleteTransaction, "ContractDeleteTransaction"],
  [FileCreateTransaction, "FileCreateTransaction"],
  [FileAppendTransaction, "FileAppendTransaction"],
  [FileUpdateTransaction, "FileUpdateTransaction"],
  [FileDeleteTransaction, "FileDeleteTransaction"],
  [ScheduleCreateTransaction, "ScheduleCreateTransaction"],
  [ScheduleSignTransaction, "ScheduleSignTransaction"],
  [ScheduleDeleteTransaction, "ScheduleDeleteTransaction"],
  [PrngTransaction, "PrngTransaction"],
];

export function resolveTxType(tx: Transaction): string {
  for (const [cls, name] of TX_TYPES) {
    if (tx instanceof cls) return name;
  }
  return "Transaction";
}

export interface BuildResult {
  /** Short transaction-type label, e.g. "TokenCreateTransaction" */
  type: string;
  /** Frozen, unsigned transaction encoded as base64 */
  base64: string;
  /** Generated transaction id (payer@valid-start) */
  transactionId: string;
}

export class HederaCtx {
  readonly network: NetworkConfig;
  readonly operatorId?: AccountId;
  private _client?: Client;

  constructor() {
    this.network = resolveNetwork();
    const opId = process.env.HEDERA_OPERATOR_ID?.trim();
    if (opId && opId !== "0.0.xxxxxx") {
      this.operatorId = AccountId.fromString(opId);
    }
  }

  /** Node account ids for this network as SDK AccountId objects. */
  get nodeAccountIds(): AccountId[] {
    return this.network.nodeAccountIds.map((id) => AccountId.fromString(id));
  }

  /**
   * A network Client used only for offline operations (node list, fee schedules).
   * No operator/key is set — it is never used to execute anything.
   */
  get client(): Client {
    if (!this._client) {
      this._client = Client.forName(this.network.name);
    }
    return this._client;
  }

  /** Resolve the payer account: explicit arg → env operator → error. */
  payer(payerAccountId?: string): AccountId {
    if (payerAccountId) return AccountId.fromString(payerAccountId);
    if (this.operatorId) return this.operatorId;
    throw new Error(
      "No payer account. Pass `payerAccountId`, or set HEDERA_OPERATOR_ID in the environment.",
    );
  }

  /**
   * Freeze a transaction for offline signing (build-only) and serialize to base64.
   * Sets a generated transaction id from the payer and the network's node accounts,
   * so the resulting bytes are valid to sign and submit as-is.
   */
  build(tx: Transaction, payerAccountId?: string): BuildResult {
    const payer = this.payer(payerAccountId);
    const txId = TransactionId.generate(payer);
    tx.setTransactionId(txId).setNodeAccountIds(this.nodeAccountIds).freeze();
    return {
      type: resolveTxType(tx),
      base64: Buffer.from(tx.toBytes()).toString("base64"),
      transactionId: txId.toString(),
    };
  }

  /** Render a BuildResult as the standard tool response. */
  render(result: BuildResult, summary: string): string {
    return [
      `✅ Built (unsigned) ${result.type} on ${this.network.name}`,
      "",
      summary,
      "",
      `Transaction ID: ${result.transactionId}`,
      "",
      "Sign & submit (this server never does):",
      "  • SDK:  Transaction.fromBytes(Buffer.from(b64,'base64')).sign(key).execute(client)",
      "  • Wallet: import the bytes into HashPack / Blade, or use the `hedera` CLI",
      "",
      "Transaction (base64):",
      result.base64,
    ].join("\n");
  }

  /** Build + render in one call. */
  buildAndRender(tx: Transaction, summary: string, payerAccountId?: string): string {
    return this.render(this.build(tx, payerAccountId), summary);
  }

  /** GET a Mirror Node REST path (keyless). `path` should start with "/api/v1/...". */
  async mirror<T = any>(path: string): Promise<T> {
    const url = `${this.network.mirror}${path}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Mirror Node ${res.status} for ${path}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  /** POST to a Mirror Node REST path (used for contracts/call eth_call reads). */
  async mirrorPost<T = any>(path: string, body: unknown): Promise<T> {
    const url = `${this.network.mirror}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Mirror Node ${res.status} for ${path}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  explorerTx(txId: string): string {
    // HashScan expects transaction ids in the form 0.0.x-seconds-nanos
    const normalized = txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
    return `${this.network.explorer}/transaction/${normalized}`;
  }
}

/** Pretty-print any JSON payload for tool output. */
export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
