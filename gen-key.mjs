// Generate a THROWAWAY ECDSA testnet keypair and write it to .env (gitignored).
// Prints only public info (EVM address + public key) — the private key goes
// straight to .env and is never echoed. Rotate/discard after verifying.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { PrivateKey } from "@hashgraph/sdk";

const key = PrivateKey.generateECDSA();
const pub = key.publicKey;
const evm = "0x" + pub.toEvmAddress();
const raw = key.toStringRaw();

// Don't clobber an existing operator key.
const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
if (env.includes("HEDERA_OPERATOR_KEY=") && !env.includes("HEDERA_OPERATOR_KEY=\n")) {
  console.log("ALREADY_SET: .env already has HEDERA_OPERATOR_KEY — not overwriting.");
} else {
  appendFileSync(
    ".env",
    `\n# throwaway testnet key — rotate after verifying\nHEDERA_NETWORK=testnet\nHEDERA_OPERATOR_KEY=${raw}\n`,
  );
  console.log("WROTE .env (private key not shown)");
}

console.log("EVM_ADDRESS:", evm);
console.log("PUBLIC_KEY:", pub.toStringRaw());
