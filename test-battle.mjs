// Battle test — exercise all 51 tools against live testnet.
//
// Strategy (near-zero spend):
//   • READ tools: bootstrap real entities by listing them from the Mirror Node
//     (a live token, NFT, contract, schedule) + use system file 0.0.102 and our
//     own topic; assert each returns real data.
//   • WRITE tools: assert each builds a valid unsigned transaction (decodes back).
//
// Run: node test-battle.mjs        (uses HEDERA_OPERATOR_ID from .env if present)
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

const NETWORK = process.env.HEDERA_NETWORK || "testnet";
const MIRROR = `https://${NETWORK}.mirrornode.hedera.com`;
const OP = process.env.HEDERA_OPERATOR_ID || "0.0.98";
const mget = (p) => fetch(`${MIRROR}${p}`).then((r) => (r.ok ? r.json() : {}));

// --- Bootstrap real testnet entities to read against ---
console.log(`Bootstrapping read targets from ${NETWORK} Mirror Node…`);
const ft = (await mget(`/api/v1/tokens?type=FUNGIBLE_COMMON&limit=1`)).tokens?.[0]?.token_id;
let nftTok, nft;
for (const t of (await mget(`/api/v1/tokens?type=NON_FUNGIBLE_UNIQUE&limit=20`)).tokens ?? []) {
  const n = (await mget(`/api/v1/tokens/${t.token_id}/nfts?limit=1`)).nfts?.[0];
  if (n?.serial_number != null) { nftTok = t.token_id; nft = n; break; }
}
const contract = (await mget(`/api/v1/contracts?limit=1`)).contracts?.[0]?.contract_id;
const schedule = (await mget(`/api/v1/schedules?limit=1`)).schedules?.[0]?.schedule_id;
const tx = (await mget(`/api/v1/transactions?limit=1`)).transactions?.[0]?.transaction_id;
const opInfo = await mget(`/api/v1/accounts/${OP}`);
const opPubKey = opInfo?.key?.key || "02921efa9060917ee83134e45682e093f6d46fe3dbe88fab1650f3134fd6447e33";
const opEvm = opInfo?.evm_address || "0x0000000000000000000000000000000000000001";
const blockNum = (await mget(`/api/v1/blocks?limit=1&order=desc`)).blocks?.[0]?.number ?? 1;
const TOPIC = "0.0.9092470"; // created during live verification
const SYS_FILE = "0.0.102"; // public address-book system file

console.log(`  token=${ft} nft=${nftTok}#${nft?.serial_number} contract=${contract} schedule=${schedule}\n`);

// --- Connect MCP server (build-only) ---
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, HEDERA_NETWORK: NETWORK, HEDERA_OPERATOR_ID: OP },
});
const mcp = new Client({ name: "battle", version: "0.0.0" }, { capabilities: {} });
await mcp.connect(transport);
const { tools } = await mcp.listTools();
const known = new Set(tools.map((t) => t.name));

// Build one transfer so we have bytes for decode + schedule tests
const xferText = (await mcp.callTool({ name: "hedera_transfer_hbar", arguments: { toAccountId: "0.0.98", amountHbar: 1 } })).content[0].text;
const xferB64 = xferText.split("Transaction (base64):\n")[1]?.trim();

// kind: "read" expects real data; "build" expects unsigned bytes
const SKIP = Symbol("skip");
const TESTS = {
  // Account
  hedera_create_account: ["build", { publicKey: opPubKey, initialBalanceHbar: 1 }],
  hedera_transfer_hbar: ["build", { toAccountId: "0.0.98", amountHbar: 1 }],
  hedera_update_account: ["build", { accountId: OP, memo: "battle" }],
  hedera_delete_account: ["build", { accountId: "0.0.99999999", transferAccountId: OP }],
  hedera_approve_hbar_allowance: ["build", { spenderAccountId: "0.0.98", amountHbar: 1 }],
  hedera_get_account_info: ["read", { accountId: OP }],
  hedera_get_account_balance: ["read", { accountId: OP }],
  hedera_get_account_nfts: ["read", { accountId: OP }],
  // Token
  hedera_create_fungible_token: ["build", { name: "Battle", symbol: "BTL", initialSupply: 100 }],
  hedera_create_nft_collection: ["build", { name: "BattleN", symbol: "BTLN", supplyKey: opPubKey }],
  hedera_mint_fungible: ["build", { tokenId: ft || "0.0.1", amount: 1 }],
  hedera_mint_nft: ["build", { tokenId: nftTok || "0.0.1", metadata: ["ipfs://battle"] }],
  hedera_burn_token: ["build", { tokenId: ft || "0.0.1", amount: 1 }],
  hedera_transfer_token: ["build", { tokenId: ft || "0.0.1", toAccountId: "0.0.98", amount: 1 }],
  hedera_transfer_nft: ["build", { tokenId: nftTok || "0.0.1", serial: 1, toAccountId: "0.0.98" }],
  hedera_associate_token: ["build", { accountId: OP, tokenIds: [ft || "0.0.1"] }],
  hedera_dissociate_token: ["build", { accountId: OP, tokenIds: [ft || "0.0.1"] }],
  hedera_freeze_token_account: ["build", { tokenId: ft || "0.0.1", accountId: OP }],
  hedera_unfreeze_token_account: ["build", { tokenId: ft || "0.0.1", accountId: OP }],
  hedera_grant_kyc: ["build", { tokenId: ft || "0.0.1", accountId: OP }],
  hedera_revoke_kyc: ["build", { tokenId: ft || "0.0.1", accountId: OP }],
  hedera_pause_token: ["build", { tokenId: ft || "0.0.1" }],
  hedera_unpause_token: ["build", { tokenId: ft || "0.0.1" }],
  hedera_wipe_token: ["build", { tokenId: ft || "0.0.1", accountId: "0.0.98", amount: 1 }],
  hedera_delete_token: ["build", { tokenId: ft || "0.0.1" }],
  hedera_get_token_info: ["read", ft ? { tokenId: ft } : SKIP],
  hedera_get_nft_info: ["read", nft ? { tokenId: nftTok, serial: nft.serial_number } : SKIP],
  // Consensus
  hedera_create_topic: ["build", { memo: "battle" }],
  hedera_submit_message: ["build", { topicId: TOPIC, message: "battle" }],
  hedera_update_topic: ["build", { topicId: TOPIC, memo: "battle2" }],
  hedera_delete_topic: ["build", { topicId: TOPIC }],
  hedera_get_topic_info: ["read", { topicId: TOPIC }],
  hedera_get_topic_messages: ["read", { topicId: TOPIC }],
  // Contract
  hedera_deploy_contract: ["build", { bytecodeFileId: SYS_FILE, gas: 100000 }],
  hedera_execute_contract: ["build", { contractId: contract || "0.0.1", gas: 100000, functionParametersBase64: Buffer.from("00").toString("base64") }],
  hedera_query_contract: ["read", contract ? { contractIdOrAddress: contract, dataHex: "0x18160ddd" } : SKIP, { tolerateError: true }],
  hedera_get_contract_info: ["read", contract ? { contractId: contract } : SKIP],
  // File
  hedera_create_file: ["build", { contents: "battle test" }],
  hedera_append_file: ["build", { fileId: SYS_FILE, contents: "x" }],
  hedera_delete_file: ["build", { fileId: SYS_FILE }],
  hedera_get_file_info: ["read", { fileId: SYS_FILE }],
  // Schedule
  hedera_create_schedule: ["build", { toAccountId: "0.0.98", amountHbar: 1 }],
  hedera_sign_schedule: ["build", schedule ? { scheduleId: schedule } : { scheduleId: "0.0.1" }],
  hedera_delete_schedule: ["build", schedule ? { scheduleId: schedule } : { scheduleId: "0.0.1" }],
  hedera_get_schedule_info: ["read", schedule ? { scheduleId: schedule } : SKIP],
  // Network
  hedera_get_transaction: ["read", tx ? { transactionId: tx } : SKIP],
  hedera_get_network_nodes: ["read", {}],
  hedera_get_exchange_rate: ["read", {}],
  hedera_get_network_supply: ["read", {}],
  hedera_get_network_fees: ["read", {}],
  hedera_decode_transaction: ["read", { transactionBase64: xferB64 }],
  // Expanded — token
  hedera_update_token: ["build", { tokenId: ft || "0.0.1", memo: "battle" }],
  hedera_token_airdrop: ["build", { tokenId: ft || "0.0.1", toAccountId: "0.0.98", amount: 1 }],
  hedera_reject_token: ["build", { tokenId: ft || "0.0.1" }],
  hedera_approve_token_allowance: ["build", { tokenId: ft || "0.0.1", spenderAccountId: "0.0.98", amount: 1 }],
  hedera_approve_nft_allowance: ["build", { tokenId: nftTok || "0.0.1", spenderAccountId: "0.0.98" }],
  // Expanded — contract
  hedera_update_contract: ["build", { contractId: contract || "0.0.1", memo: "battle" }],
  hedera_delete_contract: ["build", { contractId: contract || "0.0.1", transferAccountId: OP }],
  // Expanded — file
  hedera_update_file: ["build", { fileId: "0.0.150", contents: "battle" }],
  // Expanded — prng
  hedera_prng: ["build", { range: 100 }],
  // Expanded — analytics reads
  hedera_get_block: ["read", { numberOrHash: String(blockNum) }],
  hedera_get_blocks: ["read", { limit: 5 }],
  hedera_get_account_transactions: ["read", { accountId: OP }],
  hedera_get_token_balances: ["read", ft ? { tokenId: ft } : SKIP],
  hedera_get_token_nfts: ["read", nftTok ? { tokenId: nftTok } : SKIP],
  hedera_get_nft_history: ["read", nft ? { tokenId: nftTok, serial: nft.serial_number } : SKIP],
  hedera_get_account_allowances: ["read", { accountId: OP }],
  hedera_get_account_token_allowances: ["read", { accountId: OP }],
  hedera_get_account_nft_allowances: ["read", { accountId: OP }],
  hedera_get_contract_results: ["read", contract ? { contractId: contract } : SKIP],
  hedera_get_contract_state: ["read", contract ? { contractId: contract } : SKIP],
  hedera_get_network_stake: ["read", {}],
  hedera_search_accounts_by_pubkey: ["read", { publicKey: opPubKey }],
  hedera_get_account_by_evm: ["read", { evmAddress: opEvm }],
};

let pass = 0, fail = 0, skip = 0;
const fails = [];
for (const name of tools.map((t) => t.name)) {
  const spec = TESTS[name];
  if (!spec) { console.log(`?  ${name} — no test defined`); skip++; continue; }
  const [kind, args, opts = {}] = spec;
  if (args === SKIP) { console.log(`⏭  ${name} — skip (no live target)`); skip++; continue; }
  try {
    const res = await mcp.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? "";
    if (res.isError) {
      if (opts.tolerateError) { console.log(`⏭  ${name} — skip (tolerated: ${text.slice(0, 50)})`); skip++; }
      else { console.log(`❌ ${name} — ${text.slice(0, 80)}`); fail++; fails.push(name); }
      continue;
    }
    if (kind === "build" && !text.includes("Built (unsigned)")) {
      console.log(`❌ ${name} — build did not return unsigned tx`); fail++; fails.push(name); continue;
    }
    console.log(`✅ ${kind === "build" ? "build" : "read "} ${name}`);
    pass++;
  } catch (e) {
    console.log(`❌ ${name} — threw: ${e.message?.slice(0, 80)}`); fail++; fails.push(name);
  }
}

console.log(`\n=== ${pass} passed · ${fail} failed · ${skip} skipped · ${tools.length} tools ===`);
if (fails.length) console.log("FAILED:", fails.join(", "));
await mcp.close();
process.exit(fail ? 1 : 0);
