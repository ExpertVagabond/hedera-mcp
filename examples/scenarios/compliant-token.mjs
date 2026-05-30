// USE CASE: permissioned / regulated token (RWA, stablecoin, security token). The token
// carries a KYC key and a freeze key, so the ISSUER controls who may hold it — transfers are
// protocol-blocked until an account is KYC-approved, and can be frozen for compliance at any
// time. No smart contract, no allowlist contract, no off-chain gatekeeper: the network itself
// enforces eligibility. Lifecycle shown: blocked → KYC → allowed → frozen → blocked → unfrozen.
import { PrivateKey } from "@hashgraph/sdk";
import { connect, runner, mirror, sleep } from "./_lib.mjs";

const { mcp, client, key, OP, M } = await connect();
const run = runner(mcp, client, key);
const opPub = key.publicKey.toStringRaw();

let FAILED = false;
// expectFail: run a transfer we EXPECT the network to reject, asserting the response code.
async function expectFail(label, want, fn) {
  try {
    await fn();
    console.log(`❌ ${label} — expected ${want} but it SUCCEEDED`);
    FAILED = true;
  } catch (e) {
    const s = (e.status?.toString() ?? e.message ?? "").toString();
    const ok = s.includes(want);
    console.log(`${ok ? "✅" : "❌"} ${label} — network rejected: ${s.slice(0, 48)} ${ok ? "(as designed)" : `(wanted ${want})`}`);
    if (!ok) FAILED = true;
  }
}

console.log("🛂 COMPLIANT TOKEN — KYC-gated, freezable; the issuer controls holders (no contract)\n");

const keyB = PrivateKey.generateECDSA();
const B = (await run("hedera_create_account", { publicKey: keyB.publicKey.toStringRaw(), initialBalanceHbar: 5 })).accountId.toString();
console.log(`investor B = ${B}`);

const TOK = (await run("hedera_create_fungible_token", {
  name: "Regulated USD", symbol: "rUSD", decimals: 2, initialSupply: 1_000_000,
  treasuryAccountId: OP, supplyKey: opPub, kycKey: opPub, freezeKey: opPub,
})).tokenId.toString();
console.log(`token = ${TOK} · decimals 2 · kycKey + freezeKey held by issuer\n`);

// Association is allowed (it only opts the account in to *potentially* hold the token).
await run("hedera_associate_token", { accountId: B, tokenIds: [TOK] }, [keyB]);
console.log("B associated rUSD (opt-in only — holding still gated by KYC)");

// 1) Transfer BEFORE KYC → rejected at consensus.
await expectFail("transfer 100 rUSD to B before KYC", "ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN",
  () => run("hedera_transfer_token", { tokenId: TOK, toAccountId: B, amount: 10_000 }));

// 2) Issuer grants KYC → the same transfer now clears.
await run("hedera_grant_kyc", { tokenId: TOK, accountId: B });
await run("hedera_transfer_token", { tokenId: TOK, toAccountId: B, amount: 10_000 });
console.log("✅ after grant_kyc: issuer transferred 100.00 rUSD to B");

// 3) Issuer freezes B (e.g. sanctions hit) → next transfer blocked.
await run("hedera_freeze_token_account", { tokenId: TOK, accountId: B });
await expectFail("transfer 50 rUSD to frozen B", "ACCOUNT_FROZEN_FOR_TOKEN",
  () => run("hedera_transfer_token", { tokenId: TOK, toAccountId: B, amount: 5_000 }));

// 4) Issuer unfreezes → transfers resume.
await run("hedera_unfreeze_token_account", { tokenId: TOK, accountId: B });
await run("hedera_transfer_token", { tokenId: TOK, toAccountId: B, amount: 5_000 });
console.log("✅ after unfreeze: issuer transferred another 50.00 rUSD to B");

await sleep(6000);
const bal = await mirror(M, `/api/v1/accounts/${B}/tokens?token.id=${TOK}`);
const held = bal.tokens?.[0]?.balance ?? 0;
console.log(`\n✅ B holds ${(held / 100).toFixed(2)} rUSD on-chain (expected 150.00) ${held === 15_000 ? "✓" : "✗"}`);
if (held !== 15_000) FAILED = true;

await mcp.close();
console.log(FAILED ? "\nKYC_FAIL" : "\nKYC_OK");
process.exit(FAILED ? 1 : 0);
