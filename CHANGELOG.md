# Changelog

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
