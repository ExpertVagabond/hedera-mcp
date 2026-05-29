// Resolve the auto-created account id for the funded EVM address and write
// HEDERA_OPERATOR_ID into .env. Polls Mirror Node until the account is indexed.
import { appendFileSync, readFileSync } from "node:fs";

const EVM = process.argv[2] || "0x25e102d743ed05d598585f213582506c75451adc";
const MIRROR = "https://testnet.mirrornode.hedera.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let accountId = null;
for (let i = 0; i < 20; i++) {
  try {
    const r = await fetch(`${MIRROR}/api/v1/accounts/${EVM}`);
    if (r.ok) {
      const j = await r.json();
      if (j.account) {
        accountId = j.account;
        console.log(`account=${accountId} balance=${j.balance?.balance ?? "?"} tinybars`);
        break;
      }
    }
  } catch {}
  await sleep(3000);
  process.stdout.write(".");
}

if (!accountId) {
  console.log("\nNOT_INDEXED_YET — try again in a few seconds.");
  process.exit(1);
}

const env = readFileSync(".env", "utf8");
if (env.includes("HEDERA_OPERATOR_ID=") && !/HEDERA_OPERATOR_ID=\s*$/m.test(env)) {
  console.log("HEDERA_OPERATOR_ID already set — leaving as is.");
} else {
  appendFileSync(".env", `HEDERA_OPERATOR_ID=${accountId}\n`);
  console.log(`WROTE HEDERA_OPERATOR_ID=${accountId} to .env`);
}
