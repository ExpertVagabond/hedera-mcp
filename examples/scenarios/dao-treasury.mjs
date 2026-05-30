// USE CASE: DAO / multi-sig treasury. A payout is *scheduled*, then sits pending until enough
// council members approve it — the network auto-executes the instant the 2-of-3 threshold is
// met. Governance with no governor contract: signatures are gathered on-chain via ScheduleSign,
// and the third signer is never needed. get_schedule_info / Mirror show the pending → executed
// transition.
import { PrivateKey, KeyList, AccountCreateTransaction, Hbar } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);

console.log("🏛️  DAO TREASURY — 2-of-3 scheduled payout, network-enforced threshold (no contract)\n");

// Three council members; the treasury account's key is a 2-of-3 threshold KeyList.
// NOTE: a KeyList account is created with the SDK directly (the MCP create_account takes a
// single public key). Everything after this — schedule, approvals, reads — goes through the MCP.
const council = [PrivateKey.generateECDSA(), PrivateKey.generateECDSA(), PrivateKey.generateECDSA()];
const threshold = new KeyList(council.map((k) => k.publicKey), 2);
const ac = new AccountCreateTransaction().setInitialBalance(new Hbar(25));
(typeof ac.setKeyWithoutAlias === "function" ? ac.setKeyWithoutAlias(threshold) : ac.setKey(threshold));
const TREASURY = (await (await ac.execute(client)).getReceipt(client)).accountId.toString();
console.log(`treasury (2-of-3 KeyList) = ${TREASURY}, funded 25 ℏ`);

// Grantee who receives the payout.
const keyG = PrivateKey.generateECDSA();
const G = (await run("hedera_create_account", { publicKey: keyG.publicKey.toStringRaw(), initialBalanceHbar: 0 })).accountId.toString();
const before = (await mirror(M, `/api/v1/accounts/${G}`)).balance?.balance ?? 0;
console.log(`grantee = ${G} (starting ${before / 1e8} ℏ)`);

// 1) A council member PROPOSES the payout by scheduling it (operator pays the ScheduleCreate;
//    operator is NOT in the treasury KeyList, so this alone authorizes nothing to move).
const SCH = (await run("hedera_create_schedule", {
  fromAccountId: TREASURY, toAccountId: G, amountHbar: 10, memo: "grant: dev bounty",
})).scheduleId.toString();
console.log(`\n📋 proposed 10 ℏ → grantee as schedule ${SCH}`);

// 2) First approval. Below threshold → still pending, nothing executes.
await run("hedera_sign_schedule", { scheduleId: SCH }, [council[0]]);
let info = await mirror(M, `/api/v1/schedules/${SCH}`);
console.log(`signer 1 approved · executed_timestamp=${info.executed_timestamp ?? "null"} (pending, 1 of 2)`);

// 3) Second approval → 2-of-3 met → the network auto-executes the wrapped transfer.
await run("hedera_sign_schedule", { scheduleId: SCH }, [council[1]]);
await sleep(7000);
info = await mirror(M, `/api/v1/schedules/${SCH}`);
const after = (await mirror(M, `/api/v1/accounts/${G}`)).balance?.balance ?? 0;
console.log(`signer 2 approved · executed_timestamp=${info.executed_timestamp ?? "null"}`);

const moved = after - before;
console.log(`\n✅ grantee balance ${before / 1e8} ℏ → ${after / 1e8} ℏ (received ${moved / 1e8} ℏ)`);
const ok = Boolean(info.executed_timestamp) && moved === 10e8;
console.log(`✅ payout fired only after the 2-of-3 threshold — signer 3 never participated ${ok ? "✓" : "✗"}`);

await mcp.close();
console.log(ok ? "\nDAO_OK" : "\nDAO_FAIL");
process.exit(ok ? 0 : 1);
