// USE CASE: supply-chain provenance. A single NFT is the digital twin of a physical item;
// each custody handoff is an on-chain NFT transfer, mirrored by an HCS log entry. Anyone can
// later reconstruct a tamper-evident chain of custody from the NFT's transfer history plus the
// topic — the item's whole journey, consensus-timestamped, no central database to trust.
import { PrivateKey } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);
const opPub = key.publicKey.toStringRaw();

console.log("📦 CHAIN OF CUSTODY — NFT digital twin + HCS provenance log\n");

// Custody parties (the producer is the issuer/treasury = operator).
const party = (label) => ({ label, k: PrivateKey.generateECDSA() });
const shipper = party("Shipper"), customs = party("Customs"), retailer = party("Retailer");
for (const p of [shipper, customs, retailer]) {
  p.id = (await run("hedera_create_account", { publicKey: p.k.publicKey.toStringRaw(), initialBalanceHbar: 2 })).accountId.toString();
}
console.log(`producer = ${OP} (issuer)\nshipper=${shipper.id}  customs=${customs.id}  retailer=${retailer.id}`);

// Collection + the item's digital twin (serial 1).
const NFT = (await run("hedera_create_nft_collection", {
  name: "Coffee Lot #42", symbol: "LOT42", treasuryAccountId: OP, supplyKey: opPub,
})).tokenId.toString();
const serial = Number((await run("hedera_mint_nft", { tokenId: NFT, metadata: ["Ethiopia Yirgacheffe · 60kg · lot 42"] })).serials[0]);
console.log(`\nminted digital twin ${NFT}#${serial} at producer`);

// Provenance topic — every handoff is appended here.
const TOPIC = (await run("hedera_create_topic", { memo: `custody:${NFT}` })).topicId.toString();

// Walk the item down the chain; the current holder must sign the handoff, and each step is logged.
let holder = { id: OP, k: key };
for (const next of [shipper, customs, retailer]) {
  await run("hedera_associate_token", { accountId: next.id, tokenIds: [NFT] }, [next.k]);
  const extra = holder.id === OP ? [] : [holder.k]; // sender authorizes the transfer
  await run("hedera_transfer_nft", { tokenId: NFT, serial, fromAccountId: holder.id, toAccountId: next.id }, extra);
  await run("hedera_submit_message", {
    topicId: TOPIC,
    message: JSON.stringify({ evt: "custody_transfer", nft: `${NFT}#${serial}`, to: next.label, acct: next.id }),
  });
  console.log(`→ ${holder.id} handed off to ${next.label} (${next.id}); logged to topic`);
  holder = { id: next.id, k: next.k };
}

await sleep(7000);
// Reconstruct provenance from two independent on-chain sources.
const hist = await mirror(M, `/api/v1/tokens/${NFT}/nfts/${serial}/transactions`);
const msgs = await mirror(M, `/api/v1/topics/${TOPIC}/messages`);
console.log(`\n📜 NFT transfer history (${hist.transactions?.length ?? 0} entries):`);
for (const t of hist.transactions ?? []) {
  console.log(`   ${t.consensus_timestamp}  ${t.sender_account_id ?? "MINT"} → ${t.receiver_account_id ?? OP}  [${t.type}]`);
}
console.log(`📜 HCS custody log (${msgs.messages?.length ?? 0} entries):`);
for (const m of msgs.messages ?? []) console.log(`   ${Buffer.from(m.message, "base64").toString()}`);

const owner = (await mirror(M, `/api/v1/tokens/${NFT}/nfts/${serial}`)).account_id;
const ok = owner === retailer.id && (msgs.messages?.length ?? 0) === 3 && (hist.transactions?.length ?? 0) >= 4;
console.log(`\n✅ final holder = ${owner} (retailer ${retailer.id}) ${owner === retailer.id ? "✓" : "✗"}`);
console.log(`✅ provenance: 1 mint + 3 handoffs on-chain · 3 HCS custody entries ${ok ? "✓" : "✗"}`);

await mcp.close();
console.log(ok ? "\nCUSTODY_OK" : "\nCUSTODY_FAIL");
process.exit(ok ? 0 : 1);
