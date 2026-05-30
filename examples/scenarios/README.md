# Unique use-case scenarios

Distinctive things `hedera-mcp` makes easy — each a runnable script that builds via the
MCP (build-only), signs with the operator key in `.env`, executes on testnet, and verifies
via Mirror Node. Run from the project root: `node examples/scenarios/<name>.mjs`.

| Scenario | What it shows | Hedera primitive |
|---|---|---|
| [`notary.mjs`](notary.mjs) | Hash a document → consensus-timestamp it → verify; tampering is detectable | HCS timestamps |
| [`audit-trail.mjs`](audit-trail.mjs) | An AI agent logs every action to HCS, then replays its own verifiable history | HCS + AI accountability |
| [`agent-payments.mjs`](agent-payments.mjs) | Agent A pays Agent B in service-credit tokens per task, with a commerce ledger | HTS + HCS |
| [`self-taxing-token.mjs`](self-taxing-token.mjs) | A token where every transfer auto-tolls a treasury — no smart contract | HTS custom fees |
| [`compliant-token.mjs`](compliant-token.mjs) | KYC-gated, freezable token: transfers are network-rejected until the issuer grants KYC, and blocked again when an account is frozen — RWA/stablecoin rails, no contract | HTS KYC + freeze |
| [`verifiable-raffle.mjs`](verifiable-raffle.mjs) | Consensus PRNG (VRF-backed, not caller-seedable) picks a winner; the prize NFT is minted straight to them | Native PRNG + HTS NFT |
| [`dao-treasury.mjs`](dao-treasury.mjs) | A 2-of-3 scheduled payout that stays pending until the threshold of council signatures is gathered on-chain, then auto-executes | Scheduled tx + KeyList threshold |
| [`chain-of-custody.mjs`](chain-of-custody.mjs) | An NFT digital twin handed producer→shipper→customs→retailer; provenance reconstructed from NFT transfer history + an HCS log | HTS NFT × HCS |

All eight were verified live on Hedera testnet — each asserts its claim, including the negative
ones (e.g. `compliant-token` proves the network *rejects* a pre-KYC transfer with
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`, and `dao-treasury` proves the payout does not move on one
signature). They double as DevRel demos: a single command that produces an on-chain,
independently-verifiable result.
