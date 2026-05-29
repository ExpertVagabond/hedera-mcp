// Real Solidity contract, end-to-end through the MCP: compile -> file -> deploy
// -> execute(store) -> query(retrieve) via Mirror eth_call -> contract info.
// The server stays build-only; this harness signs with the operator key from .env.
//
// Run: node test-contract.mjs
import { readFileSync } from "node:fs";
import solc from "solc";
import { Client, PrivateKey, Transaction } from "@hashgraph/sdk";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { HEDERA_OPERATOR_ID: OP, HEDERA_OPERATOR_KEY } = process.env;
const NETWORK = process.env.HEDERA_NETWORK || "testnet";
if (!OP || !HEDERA_OPERATOR_KEY) { console.log("SKIP: operator id + key required"); process.exit(0); }
function parseKey(s){for(const f of [PrivateKey.fromStringECDSA,PrivateKey.fromStringED25519,PrivateKey.fromString]){try{return f(s);}catch{}}throw new Error("bad key");}
const key = parseKey(HEDERA_OPERATOR_KEY);
const opPub = key.publicKey.toStringRaw();
const client = (NETWORK==="mainnet"?Client.forMainnet():Client.forTestnet()).setOperator(OP,key);
const M = NETWORK==="mainnet"?"https://mainnet-public.mirrornode.hedera.com":`https://${NETWORK}.mirrornode.hedera.com`;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

// --- 1. Compile a small Solidity contract ---
const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Storage {
    uint256 private number;
    function store(uint256 num) public { number = num; }
    function retrieve() public view returns (uint256) { return number; }
}`;
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "Storage.sol": { content: source } },
  settings: { outputSelection: { "*": { "*": ["evm.bytecode.object", "evm.methodIdentifiers"] } } },
})));
const c = out.contracts["Storage.sol"].Storage;
const bytecode = c.evm.bytecode.object;
const sel = c.evm.methodIdentifiers; // { "retrieve()": "...", "store(uint256)": "..." }
console.log(`Compiled Storage (${bytecode.length / 2} bytes) · store=0x${sel["store(uint256)"]} retrieve=0x${sel["retrieve()"]}\n`);

const transport = new StdioClientTransport({ command:"node", args:["dist/index.js"], env:{...process.env} });
const mcp = new McpClient({name:"contract",version:"0.0.0"},{capabilities:{}});
await mcp.connect(transport);
async function run(tool,args,label,extra=[]){
  const text=(await mcp.callTool({name:tool,arguments:args})).content[0].text;
  const b64=text.split("Transaction (base64):\n")[1]?.trim();
  if(!b64) throw new Error(`no bytes from ${tool}: ${text.slice(0,80)}`);
  let tx=await Transaction.fromBytes(Buffer.from(b64,"base64")).sign(key);
  for(const s of extra) tx=await tx.sign(s);
  const r=await (await tx.execute(client)).getReceipt(client);
  console.log(`✅ ${label} — ${r.status.toString()}`);
  return r;
}

console.log(`Contract E2E on ${NETWORK} as ${OP}\n`);

// --- 2. Store bytecode in a file ---
const fileR = await run("hedera_create_file", { contents: bytecode, key: opPub }, "create bytecode file");
const fileId = fileR.fileId.toString();

// --- 3. Deploy ---
const depR = await run("hedera_deploy_contract", { bytecodeFileId: fileId, gas: 200000, adminKey: opPub }, "deploy contract");
const contractId = depR.contractId.toString();

// --- 4. Execute store(42) ---
const storeArg = (42).toString(16).padStart(64, "0");
const storeData = Buffer.from(sel["store(uint256)"] + storeArg, "hex");
await run("hedera_execute_contract", { contractId, gas: 100000, functionParametersBase64: storeData.toString("base64") }, "execute store(42)");

// --- 5. Resolve EVM address, then read via Mirror eth_call ---
await sleep(6000);
const info = await fetch(`${M}/api/v1/contracts/${contractId}`).then(r=>r.json());
const evm = info.evm_address;
console.log(`\ncontract ${contractId} · evm ${evm}`);
const q = await mcp.callTool({ name: "hedera_query_contract", arguments: { contractIdOrAddress: evm, dataHex: "0x" + sel["retrieve()"] } });
const qtext = q.content[0].text;
const result = JSON.parse(qtext).result;
const value = parseInt(result, 16);
console.log(`✅ query retrieve() → ${value} ${value === 42 ? "(✓ matches stored 42)" : "(✗ expected 42)"}`);

const ci = await mcp.callTool({ name: "hedera_get_contract_info", arguments: { contractId } });
console.log(`✅ get_contract_info → ${JSON.parse(ci.content[0].text).contract_id}`);

await mcp.close();
console.log(`\nCONTRACT_OK — contract=${contractId} evm=${evm} retrieve=${value}`);
process.exit(value === 42 ? 0 : 1);
