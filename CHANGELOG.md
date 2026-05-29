# Changelog

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
