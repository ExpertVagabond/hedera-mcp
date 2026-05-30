// USE CASE: pay-per-call API metering. Access is a prepaid fungible credit; each request spends
// credits that are then BURNED, so consumed credits permanently leave circulation (total_supply
// = credits still owed to users). Every call is also logged to HCS for a tamper-evident usage
// trail the customer can audit — billing you can't fake.
import { PrivateKey } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);
const opPub = key.publicKey.toStringRaw();
const supplyOf = async (id) => Number(JSON.parse((await mcp.callTool({ name: "hedera_get_token_info", arguments: { tokenId: id } })).content[0].text).total_supply ?? -1);

console.log("🔌 METERED API — prepaid credits burned per call + HCS usage log\n");

const kUser = PrivateKey.generateECDSA();
const user = (await run("hedera_create_account", {
  publicKey: kUser.publicKey.toStringRaw(), initialBalanceHbar: 3, maxAutomaticTokenAssociations: 5,
})).accountId.toString();

const CREDIT = (await run("hedera_create_fungible_token", {
  name: "API Credit", symbol: "APIC", decimals: 0, initialSupply: 10_000, treasuryAccountId: OP, supplyKey: opPub,
})).tokenId.toString();
const USAGE = (await run("hedera_create_topic", { memo: `usage:${CREDIT}` })).topicId.toString();
console.log(`credit token = ${CREDIT} · usage topic = ${USAGE}`);

// User prepays: provider sells 100 credits via airdrop (auto-association, user signs nothing).
await run("hedera_token_airdrop", { tokenId: CREDIT, toAccountId: user, amount: 100 });
const supply0 = await supplyOf(CREDIT);
console.log(`\nuser prepaid 100 APIC (airdrop) · circulating supply = ${supply0}`);

// Three API calls, each costing 10 credits: user pays the provider, provider burns the spend.
const COST = 10;
for (let i = 1; i <= 3; i++) {
  await run("hedera_transfer_token", { tokenId: CREDIT, fromAccountId: user, toAccountId: OP, amount: COST }, [kUser]);
  await run("hedera_burn_token", { tokenId: CREDIT, amount: COST });
  await run("hedera_submit_message", { topicId: USAGE, message: JSON.stringify({ call: i, endpoint: "/v1/generate", cost: COST }) });
  console.log(`call ${i}: spent ${COST} APIC → burned · logged to usage topic`);
}

await sleep(7000);
const ubal = (await mirror(M, `/api/v1/accounts/${user}/tokens?token.id=${CREDIT}`)).tokens?.[0]?.balance ?? 0;
const supply1 = await supplyOf(CREDIT);
const logs = (await mirror(M, `/api/v1/topics/${USAGE}/messages`)).messages?.length ?? 0;
console.log(`\n✅ user balance: 100 → ${ubal} APIC (3 calls × ${COST}) ${ubal === 70 ? "✓" : "✗"}`);
console.log(`✅ supply burned: ${supply0} → ${supply1}  (−${supply0 - supply1}) ${supply0 - supply1 === 30 ? "✓" : "✗"}`);
console.log(`✅ usage log entries: ${logs} ${logs === 3 ? "✓" : "✗"}`);

const ok = ubal === 70 && supply0 - supply1 === 30 && logs === 3;
await mcp.close();
console.log(ok ? "\nMETER_OK" : "\nMETER_FAIL");
process.exit(ok ? 0 : 1);
