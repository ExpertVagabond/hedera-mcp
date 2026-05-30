// USE CASE: provably-fair raffle / loot box / random airdrop. Hedera's native PRNG is
// generated at consensus (VRF-backed) and cannot be predicted or biased by the caller —
// so there's no oracle, no commit-reveal, and no "trust the dev's seed". Here it picks a
// winner from an entry pool and the prize NFT is minted straight to them.
import { Transaction } from "@hashgraph/sdk";
import { PrivateKey } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);
const opPub = key.publicKey.toStringRaw();

// roll(): build the PRNG tx via the MCP, execute it, and read the bounded random uint from
// the transaction RECORD (the receipt doesn't carry it — record.prngNumber does).
async function roll(range) {
  const text = (await mcp.callTool({ name: "hedera_prng", arguments: { range } })).content[0].text;
  const b64 = text.split("Transaction (base64):\n")[1].trim();
  const tx = await Transaction.fromBytes(Buffer.from(b64, "base64")).sign(key);
  const record = await (await tx.execute(client)).getRecord(client);
  if (record.prngNumber == null) throw new Error("PRNG record carried no prngNumber");
  return Number(record.prngNumber);
}

console.log("🎲 VERIFIABLE RAFFLE — consensus PRNG picks the winner, prize NFT minted to them\n");

// Entry pool (throwaway accounts standing in for registered entrants).
const entrants = [];
for (const name of ["Ana", "Ben", "Cara", "Dan", "Eve"]) {
  const k = PrivateKey.generateECDSA();
  const id = (await run("hedera_create_account", { publicKey: k.publicKey.toStringRaw(), initialBalanceHbar: 1 })).accountId.toString();
  entrants.push({ name, id, key: k });
}
console.log("entrants → " + entrants.map((e, i) => `[${i}] ${e.name} ${e.id}`).join("   "));

// Prize collection (issuer holds the supply key).
const NFT = (await run("hedera_create_nft_collection", {
  name: "Raffle Prize", symbol: "RAFFLE", treasuryAccountId: OP, supplyKey: opPub,
})).tokenId.toString();

// Draw, bounded to the entrant count → a fair index nobody could pre-compute.
const idx = await roll(entrants.length);
const winner = entrants[idx];
console.log(`\n🎰 PRNG drew index ${idx} of ${entrants.length} → winner: ${winner.name} (${winner.id})`);

// Mint the prize and deliver it to the winner.
const serial = Number((await run("hedera_mint_nft", { tokenId: NFT, metadata: [`Raffle winner: ${winner.name}`] })).serials[0]);
await run("hedera_associate_token", { accountId: winner.id, tokenIds: [NFT] }, [winner.key]);
await run("hedera_transfer_nft", { tokenId: NFT, serial, toAccountId: winner.id });
console.log(`🏆 minted ${NFT}#${serial} and transferred it to ${winner.name}`);

await sleep(6000);
const owned = await mirror(M, `/api/v1/accounts/${winner.id}/nfts`);
const has = (owned.nfts ?? []).some((n) => n.token_id === NFT && n.serial_number === serial);
console.log(`\n✅ Mirror Node confirms ${winner.name} owns ${NFT}#${serial}: ${has ? "yes ✓" : "no ✗"}`);
console.log("   (a re-run draws a different index — the PRNG is consensus-generated, not seedable by the caller)");

await mcp.close();
console.log(has ? "\nRAFFLE_OK" : "\nRAFFLE_FAIL");
process.exit(has ? 0 : 1);
