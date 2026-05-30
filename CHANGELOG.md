# Changelog

## 0.5.0

- **ABI-aware contract calls.** `query_contract` and `execute_contract` now accept `{ abi, functionName, args }` — calldata is encoded (and read results decoded) automatically via viem, with integer args coerced to BigInt from the ABI. Raw `dataHex` / `functionParametersBase64` remain as fallbacks. Agents no longer need to hand-encode selectors.
- Verified live: `test-contract-abi.mjs` reads a deployed contract by ABI — `answer()` → 73 (uint), `title()` → "hedera-mcp" (string), `ping()` → 73 (pure) — with zero hand-encoded calldata.

## 0.4.0

- **MCP resources** (4): `hedera://network/exchange-rate`, `hedera://network/supply`, and templated `hedera://account/{id}` and `hedera://token/{id}` — addressable, keyless state agents can read by URI, alongside the 73 tools.
- **Custom fees:** `create_fungible_token` accepts an optional fixed HBAR fee + collector; `create_nft_collection` accepts royalty fees (numerator/denominator/fallback/collector).
- **Examples:** `examples/TUTORIAL.md` (build on Hedera in 5 prompts), `examples/agent-demo.md` + `examples/agent-sim.mjs` (agent-driven walkthrough), `test-contract.mjs` (Solidity E2E), `test-resources.mjs`.

## 0.3.0

- `create_fungible_token` now supports the full authority key set — **freeze, KYC, pause, and wipe** keys (in addition to admin + supply) — enabling the complete token lifecycle.
- **Battle mode** (`test-battle-live.mjs`): **31/31 operations executed on testnet** across two accounts — full token lifecycle (create-with-all-keys, mint, associate, KYC, transfer, freeze/unfreeze, pause/unpause, allowance, update, airdrop, wipe, burn, delete), NFT (create, mint, associate, transfer, allowance), topic (create/submit/update), file (create/append/update), a scheduled transfer requiring a second signer, PRNG, and hbar transfer — all Mirror Node-verified.

## 0.2.0

Expanded from 51 to **73 tools** and battle-tested end-to-end.

- **+22 tools:** token update / airdrop (HIP-904) / reject / token & NFT allowances; contract update / delete; file update; PRNG; and a 14-tool analytics layer (blocks, account transactions, token balances & NFTs, NFT history, crypto/token/NFT allowances, contract results & state, network stake, public-key & EVM-address lookups).
- **Fixed:** `create_schedule` now schedules an (unfrozen) transfer; removed `get_file_info` (file info requires a paid query, incompatible with keyless reads); minified-SDK transaction type labels.
- **Battle tested:** `test-battle.mjs` — 72/73 build+read tools pass against live testnet (1 skip: contract eth_call needs a known ABI). `test-live.mjs` — **10/10 write paths executed on testnet** (token create+mint, NFT create+mint, topic+message, file, scheduled transfer, hbar transfer, PRNG), each verified via Mirror Node.

## 0.1.0

Initial release — comprehensive build-only MCP server for Hedera (Hashgraph).

- 51 tools across Account, Token (HTS), Consensus (HCS), Smart Contract (EVM), File, Schedule, and Network services.
- Keyless reads via the Mirror Node REST API.
- Build-only writes: transactions are frozen and returned as unsigned base64 for offline signing. The server never holds keys or executes.
- `hedera_decode_transaction` for reviewing built transactions before signing.
- Supports mainnet / testnet / previewnet via `HEDERA_NETWORK`.
- Verified: `tsc` clean against `@hashgraph/sdk` 2.81.0; MCP stdio smoke test passes (live testnet Mirror Node read + build-only write round-trip).
- **Live execution verified on testnet:** build-only output signed externally and submitted — `create_topic` and `submit_message` both `SUCCESS`, confirmed independently via Mirror Node. The server held no key at any point.
- Added `gen-key.mjs` (throwaway ECDSA keypair → `.env`) and `resolve-account.mjs` (resolve auto-created account id from a faucet-funded EVM address) for reproducible verification.
