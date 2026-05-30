// USE CASE: a carbon-credit registry. Each NFT is one verified tonne of CO2; issuance = mint,
// trading = transfer, and RETIREMENT (claiming the offset) = burning the credit so it can never
// be double-counted or resold. total_supply = credits still outstanding. No smart contract — the
// registry's integrity is the token supply itself.
import { PrivateKey } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);
const opPub = key.publicKey.toStringRaw();
const supplyOf = async (id) => Number(JSON.parse((await mcp.callTool({ name: "hedera_get_token_info", arguments: { tokenId: id } })).content[0].text).total_supply ?? -1);

console.log("🌱 CARBON REGISTRY — NFT = 1 tonne CO2; mint → trade → retire (burn)\n");

const kBuyer = PrivateKey.generateECDSA();
const buyer = (await run("hedera_create_account", { publicKey: kBuyer.publicKey.toStringRaw(), initialBalanceHbar: 2 })).accountId.toString();

const REG = (await run("hedera_create_nft_collection", {
  name: "Verified Carbon Unit", symbol: "VCU", treasuryAccountId: OP, supplyKey: opPub,
})).tokenId.toString();
console.log(`registry = ${REG} · buyer = ${buyer}`);

// Issue a vintage of 3 credits. (Outstanding = the count we just minted; we assert the burn
// against this deterministic number rather than a Mirror read that may lag the mint.)
const minted = (await run("hedera_mint_nft", { tokenId: REG, metadata: ["VCU-2026-0001", "VCU-2026-0002", "VCU-2026-0003"] })).serials.map(Number);
const issued = minted.length;
console.log(`issued credits ${minted.join(", ")} · outstanding = ${issued}`);

// Trade one credit to a buyer.
await run("hedera_associate_token", { accountId: buyer, tokenIds: [REG] }, [kBuyer]);
await run("hedera_transfer_nft", { tokenId: REG, serial: minted[0], toAccountId: buyer });
console.log(`\nsold credit #${minted[0]} → buyer`);

// RETIRE the credit: buyer returns it to the registry treasury, which burns it permanently.
await run("hedera_transfer_nft", { tokenId: REG, serial: minted[0], fromAccountId: buyer, toAccountId: OP }, [kBuyer]);
await run("hedera_burn_token", { tokenId: REG, serials: [minted[0]] });
console.log(`retired credit #${minted[0]} (returned to registry + burned)`);

await sleep(7000);
const after = await supplyOf(REG);
const gone = await mirror(M, `/api/v1/tokens/${REG}/nfts/${minted[0]}`);
console.log(`\n✅ outstanding credits ${issued} → ${after} (one retired) ${after === issued - 1 ? "✓" : "✗"}`);
console.log(`   retired serial #${minted[0]} on Mirror: ${gone.deleted === true ? "deleted ✓" : JSON.stringify(gone).slice(0, 40)}`);

const ok = after === issued - 1;
await mcp.close();
console.log(ok ? "\nCARBON_OK" : "\nCARBON_FAIL");
process.exit(ok ? 0 : 1);
