# Build on Hedera in 5 prompts

A learning path that takes a developer from *"I installed an MCP server"* to *"I shipped on-chain"* — without writing a line of SDK boilerplate. Each step is a plain-English prompt to an AI agent (Claude Desktop, Claude Code, Cursor) with `hedera-mcp` connected.

> The agent calls `hedera-mcp` tools, which return **unsigned** transactions. You sign in your wallet (HashPack/Blade) or with the SDK. The server never holds your key.

**Setup** (once):
```json
{ "mcpServers": { "hedera": { "command": "npx", "args": ["-y", "@purplesquirrel/hedera-mcp"], "env": { "HEDERA_NETWORK": "testnet", "HEDERA_OPERATOR_ID": "0.0.YOURID" } } } }
```
Get a free testnet account at [portal.hedera.com](https://portal.hedera.com).

---

### 1 · Orient — read live network state
> *"What's the current HBAR exchange rate, and show me the latest few blocks on Hedera testnet."*

Agent uses `hedera_get_exchange_rate` + `hedera_get_blocks`. You see real Mirror Node data. **No keys, no cost.**

**You learn:** Hedera has a free, public REST layer (Mirror Node) for all reads.

### 2 · Create your first token (HTS)
> *"Create a fungible token called 'Loyalty Points' (symbol LOYL), 1,000,000 supply, 2 decimals, with me as treasury."*

Agent uses `hedera_create_fungible_token` → returns an unsigned `TokenCreateTransaction`. Sign it → you own a token.

**You learn:** HTS is native — no ERC-20 contract to write or audit.

### 3 · Distribute it (HIP-904 airdrop)
> *"Airdrop 100 LOYL to 0.0.1234 — they don't need to opt in first."*

Agent uses `hedera_token_airdrop`. Recipients receive without pre-association.

**You learn:** HIP-904 airdrops remove the onboarding friction of manual token association.

### 4 · Add a verifiable event log (HCS)
> *"Create a consensus topic for my app's audit log, and post the message 'user 1234 earned 100 LOYL'."*

Agent uses `hedera_create_topic` + `hedera_submit_message`, then `hedera_get_topic_messages` to read it back with consensus timestamps.

**You learn:** HCS gives you ordered, timestamped, tamper-evident logging as a primitive.

### 5 · Go EVM when you need it
> *"Compile and deploy this Solidity contract, then call retrieve()."*

Agent uses `hedera_create_file` → `hedera_deploy_contract` → `hedera_execute_contract` → `hedera_query_contract`. Same account, same tools — now in Solidity.

**You learn:** Hedera is dual — native HTS/HCS *and* a full EVM — and one MCP spans both.

---

## What you just did
Created a token, distributed it, logged events, and deployed a contract — **the full surface of a real app** — guided by an agent, signing every transaction yourself. That's the gap between *"certified"* and *"shipping"*, closed in five prompts.

**Next:** swap `HEDERA_NETWORK` to `mainnet` for reads, wire signing into your app's wallet, and explore the other 60+ tools (`hedera_*`) — allowances, scheduled transactions, NFT royalties, analytics. See the [README](../README.md) for the full catalog.
