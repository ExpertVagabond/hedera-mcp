// USE CASE: self-taxing token. A fixed HBAR fee is attached to the token at creation,
// so EVERY transfer automatically pays a toll to a treasury — protocol-enforced, no
// smart contract. Here the toll funds a "community treasury" account.
import { PrivateKey } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);
const keyT = PrivateKey.generateECDSA();
const keyB = PrivateKey.generateECDSA();
const keyD = PrivateKey.generateECDSA();

console.log("🏦 SELF-TAXING TOKEN — every transfer funds a treasury (no contract)\n");

// Community treasury (fee collector) + two users. (The token's own treasury is
// fee-exempt, so the toll only fires on transfers *between* ordinary holders.)
const TREASURY = (await run("hedera_create_account", { publicKey: keyT.publicKey.toStringRaw(), initialBalanceHbar: 0 })).accountId.toString();
const B = (await run("hedera_create_account", { publicKey: keyB.publicKey.toStringRaw(), initialBalanceHbar: 5 })).accountId.toString();
const D = (await run("hedera_create_account", { publicKey: keyD.publicKey.toStringRaw(), initialBalanceHbar: 2 })).accountId.toString();
console.log(`treasury (collector) = ${TREASURY}  ·  user B = ${B}  ·  user D = ${D}`);

const TOK = (await run("hedera_create_fungible_token", {
  name: "Civic Token", symbol: "CIVIC", decimals: 0, initialSupply: 100000,
  supplyKey: key.publicKey.toStringRaw(), customFeeHbar: 1, feeCollectorAccountId: TREASURY,
})).tokenId.toString();
console.log(`token = ${TOK} (1 ℏ transfer toll → treasury)\n`);

await run("hedera_associate_token", { accountId: B, tokenIds: [TOK] }, [keyB]);
await run("hedera_associate_token", { accountId: D, tokenIds: [TOK] }, [keyD]);
await run("hedera_transfer_token", { tokenId: TOK, toAccountId: B, amount: 300 }); // seed B (treasury send = exempt)

const before = (await mirror(M, `/api/v1/accounts/${TREASURY}`)).balance?.balance ?? 0;
// B → D transfers: B is an ordinary holder, so each transfer tolls 1 ℏ to the treasury.
await run("hedera_transfer_token", { tokenId: TOK, fromAccountId: B, toAccountId: D, amount: 50 }, [keyB]);
await run("hedera_transfer_token", { tokenId: TOK, fromAccountId: B, toAccountId: D, amount: 50 }, [keyB]);
await run("hedera_transfer_token", { tokenId: TOK, fromAccountId: B, toAccountId: D, amount: 50 }, [keyB]);
console.log("🔁 B → D transferred CIVIC 3 times");

await sleep(8000);
const after = (await mirror(M, `/api/v1/accounts/${TREASURY}`)).balance?.balance ?? 0;
const collectedHbar = (after - before) / 1e8;
console.log(`\n✅ treasury HBAR before: ${before / 1e8} ℏ → after: ${after / 1e8} ℏ`);
console.log(`✅ auto-collected toll: ${collectedHbar} ℏ across 3 transfers — protocol-enforced, zero Solidity`);

await mcp.close();
console.log("\nTAX_OK");
process.exit(0);
