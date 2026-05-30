// USE CASE: anti-scalping event tickets. NFT tickets carry a royalty so the organiser earns a
// cut of EVERY resale (enforced by the network, not by a marketplace), and redemption at the
// gate burns the ticket so it can't be resold after entry. The royalty fallback fee proves the
// organiser's secondary-market cut is collected on-chain, automatically.
import { PrivateKey } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);
const opPub = key.publicKey.toStringRaw();
const supplyOf = async (id) => Number(JSON.parse((await mcp.callTool({ name: "hedera_get_token_info", arguments: { tokenId: id } })).content[0].text).total_supply ?? -1);

console.log("🎟️  ANTI-SCALP TICKET — royalty on every resale + burn-on-entry (no marketplace)\n");

// Organiser royalty account + first buyer + a secondary buyer.
const kArtist = PrivateKey.generateECDSA();
const ARTIST = (await run("hedera_create_account", { publicKey: kArtist.publicKey.toStringRaw(), initialBalanceHbar: 0 })).accountId.toString();
const kA = PrivateKey.generateECDSA(), kB = PrivateKey.generateECDSA();
const buyerA = (await run("hedera_create_account", { publicKey: kA.publicKey.toStringRaw(), initialBalanceHbar: 10 })).accountId.toString();
const buyerB = (await run("hedera_create_account", { publicKey: kB.publicKey.toStringRaw(), initialBalanceHbar: 10 })).accountId.toString();

const TIX = (await run("hedera_create_nft_collection", {
  name: "Show Ticket", symbol: "TIX", treasuryAccountId: OP, supplyKey: opPub,
  royaltyNumerator: 10, royaltyDenominator: 100, royaltyFallbackHbar: 5, royaltyCollectorAccountId: ARTIST,
})).tokenId.toString();
console.log(`tickets = ${TIX} (10% royalty + 5 ℏ fallback → organiser ${ARTIST})`);
const serial = Number((await run("hedera_mint_nft", { tokenId: TIX, metadata: ["Seat A1"] })).serials[0]);

// Primary sale: organiser (treasury, fee-exempt) → buyer A. No royalty on the primary sale.
await run("hedera_associate_token", { accountId: buyerA, tokenIds: [TIX] }, [kA]);
await run("hedera_transfer_nft", { tokenId: TIX, serial, toAccountId: buyerA });
console.log(`\nprimary sale: ticket #${serial} → buyer A`);

// Secondary "scalp" A → B. Royalty fallback (5 ℏ) is charged to the receiver B → organiser,
// so B must co-sign authorising the fee.
await run("hedera_associate_token", { accountId: buyerB, tokenIds: [TIX] }, [kB]);
const artistBefore = (await mirror(M, `/api/v1/accounts/${ARTIST}`)).balance?.balance ?? 0;
await run("hedera_transfer_nft", { tokenId: TIX, serial, fromAccountId: buyerA, toAccountId: buyerB }, [kA, kB]);
await sleep(6000);
const artistAfter = (await mirror(M, `/api/v1/accounts/${ARTIST}`)).balance?.balance ?? 0;
const cutExact = (artistAfter - artistBefore) / 1e8;
console.log(`resale A → B: organiser royalty collected ${cutExact} ℏ ${cutExact === 5 ? "✓" : "✗"}`);

// Entry: B redeems at the gate — ticket returns to the organiser (treasury, fee-exempt) and is burned.
await run("hedera_transfer_nft", { tokenId: TIX, serial, fromAccountId: buyerB, toAccountId: OP }, [kB]);
await run("hedera_burn_token", { tokenId: TIX, serials: [serial] });
console.log(`entry: ticket #${serial} redeemed + burned at the gate`);

await sleep(6000);
const supply = await supplyOf(TIX);
const ok = cutExact === 5 && supply === 0;
console.log(`\n✅ royalty enforced on resale (${cutExact} ℏ) ${cutExact === 5 ? "✓" : "✗"} · ticket burned on entry (supply ${supply}) ${supply === 0 ? "✓" : "✗"}`);

await mcp.close();
console.log(ok ? "\nTICKET_OK" : "\nTICKET_FAIL");
process.exit(ok ? 0 : 1);
