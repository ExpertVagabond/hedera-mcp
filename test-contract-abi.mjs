// Verify ABI-aware hedera_query_contract: deploy a real contract, then read its
// functions by passing the ABI + function name (no hand-encoded selectors) — the
// tool encodes calldata and decodes the result via viem.
// Run: node test-contract-abi.mjs
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
if (!OP || !HEDERA_OPERATOR_KEY) { console.log("SKIP: operator id+key required"); process.exit(0); }
function parseKey(s){for(const f of [PrivateKey.fromStringECDSA,PrivateKey.fromStringED25519,PrivateKey.fromString]){try{return f(s);}catch{}}throw new Error("bad key");}
const key = parseKey(HEDERA_OPERATOR_KEY);
const opPub = key.publicKey.toStringRaw();
const client = (NETWORK==="mainnet"?Client.forMainnet():Client.forTestnet()).setOperator(OP,key);
const M = NETWORK==="mainnet"?"https://mainnet-public.mirrornode.hedera.com":`https://${NETWORK}.mirrornode.hedera.com`;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Verified {
    uint256 public answer = 73;
    string public title = "hedera-mcp";
    function ping() public pure returns (uint256) { return 73; }
}`;
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "Verified.sol": { content: source } },
  settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
})));
const c = out.contracts["Verified.sol"].Verified;
const bytecode = c.evm.bytecode.object;
const abi = c.abi; // full ABI — fed straight to the tool
console.log("ABI functions:", abi.filter((x) => x.type === "function").map((x) => x.name).join(", "), "\n");

const transport = new StdioClientTransport({ command:"node", args:["dist/index.js"], env:{...process.env} });
const mcp = new McpClient({name:"abi",version:"0.0.0"},{capabilities:{}});
await mcp.connect(transport);
async function send(tool,args){
  const text=(await mcp.callTool({name:tool,arguments:args})).content[0].text;
  const b64=text.split("Transaction (base64):\n")[1]?.trim();
  if(!b64) throw new Error(`no bytes from ${tool}`);
  const tx=await Transaction.fromBytes(Buffer.from(b64,"base64")).sign(key);
  return (await tx.execute(client)).getReceipt(client);
}
// ABI-aware read: pass abi + functionName, read the decoded value back
async function callFn(evm, functionName, args = []) {
  const r = await mcp.callTool({ name:"hedera_query_contract", arguments:{ contractIdOrAddress: evm, abi, functionName, args } });
  return JSON.parse(r.content[0].text).decoded;
}

console.log(`ABI-aware query_contract test on ${NETWORK} as ${OP}\n`);
const fileId = (await send("hedera_create_file", { contents: bytecode, key: opPub })).fileId.toString();
console.log(`✅ bytecode file ${fileId}`);
const contractId = (await send("hedera_deploy_contract", { bytecodeFileId: fileId, gas: 800000, adminKey: opPub })).contractId.toString();
console.log(`✅ deployed contract ${contractId}`);
await sleep(6000);
const evm = (await fetch(`${M}/api/v1/contracts/${contractId}`).then(r=>r.json())).evm_address;
console.log(`   evm ${evm}\n`);

const a = await callFn(evm, "answer");
const title = await callFn(evm, "title");
const p = await callFn(evm, "ping");
console.log(`✅ query_contract answer() → ${a}  ${String(a)==="73"?"✓":"✗"}`);
console.log(`✅ query_contract title()  → "${title}"  ${title==="hedera-mcp"?"✓":"✗"}`);
console.log(`✅ query_contract ping()   → ${p}  ${String(p)==="73"?"✓":"✗"}`);

await mcp.close();
const ok = String(a)==="73" && title==="hedera-mcp" && String(p)==="73";
console.log(`\nABI_${ok?"OK":"FAIL"} — query_contract fed a raw ABI, encoded + decoded automatically (uint + string + pure)`);
process.exit(ok?0:1);
