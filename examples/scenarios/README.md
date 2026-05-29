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

All four were verified live on Hedera testnet (e.g. notary topic `0.0.9092917`; self-taxing
treasury auto-collected exactly 3 ℏ across 3 transfers). They double as DevRel demos: each is
a single command that produces an on-chain, independently-verifiable result.
