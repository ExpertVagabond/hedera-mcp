// Verify hedera_query_contract against a REAL contract ABI: deploy a contract with
// a uint getter, a string getter, and a pure function, then read all three via
// Mirror Node eth_call (ABI-encoded calldata in, ABI-decoded results out).
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
  settings: { outputSelection: { "*": { "*": ["evm.bytecode.object", "evm.methodIdentifiers"] } } },
})));
const c = out.contracts["Verified.sol"].Verified;
const bytecode = c.evm.bytecode.object;
const sel = c.evm.methodIdentifiers; // answer(), title(), ping()
console.log("ABI selectors:", sel, "\n");

const transport = new StdioClientTransport({ command:"node", args:["dist/index.js"], env:{...process.env} });
const mcp = new McpClient({name:"abi",version:"0.0.0"},{capabilities:{}});
await mcp.connect(transport);
async function run(tool,args){
  const text=(await mcp.callTool({name:tool,arguments:args})).content[0].text;
  const b64=text.split("Transaction (base64):\n")[1]?.trim();
  if(!b64) throw new Error(`no bytes from ${tool}`);
  const tx=await Transaction.fromBytes(Buffer.from(b64,"base64")).sign(key);
  return (await tx.execute(client)).getReceipt(client);
}
async function query(evm, selector){
  const r = await mcp.callTool({ name:"hedera_query_contract", arguments:{ contractIdOrAddress: evm, dataHex: "0x"+selector } });
  return JSON.parse(r.content[0].text).result;
}
const decodeUint = (hex) => parseInt(hex, 16);
function decodeString(hex){ const h=hex.replace(/^0x/,""); const len=parseInt(h.slice(64,128),16); return Buffer.from(h.slice(128,128+len*2),"hex").toString("utf8"); }

console.log(`Contract ABI read test on ${NETWORK} as ${OP}\n`);
const fileId = (await run("hedera_create_file", { contents: bytecode, key: opPub })).fileId.toString();
console.log(`✅ bytecode file ${fileId}`);
const contractId = (await run("hedera_deploy_contract", { bytecodeFileId: fileId, gas: 800000, adminKey: opPub })).contractId.toString();
console.log(`✅ deployed contract ${contractId}`);

await sleep(6000);
const evm = (await fetch(`${M}/api/v1/contracts/${contractId}`).then(r=>r.json())).evm_address;
console.log(`   evm ${evm}\n`);

const aHex = await query(evm, sel["answer()"]);
const tHex = await query(evm, sel["title()"]);
const pHex = await query(evm, sel["ping()"]);
const a = decodeUint(aHex), title = decodeString(tHex), p = decodeUint(pHex);
console.log(`✅ query_contract answer() → ${a}  ${a===73?"✓":"✗"}`);
console.log(`✅ query_contract title()  → "${title}"  ${title==="hedera-mcp"?"✓":"✗"}`);
console.log(`✅ query_contract ping()   → ${p}  ${p===73?"✓":"✗"}`);

await mcp.close();
const ok = a===73 && title==="hedera-mcp" && p===73;
console.log(`\nABI_${ok?"OK":"FAIL"} — query_contract verified against a real contract ABI (uint + string + pure)`);
process.exit(ok?0:1);
