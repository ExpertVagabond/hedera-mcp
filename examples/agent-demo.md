# Agent demo — "build on Hedera by asking"

A 60–90 second screen recording that shows an AI agent building on Hedera through natural language via `hedera-mcp`. This is the **certified → shipping on-ramp**, demonstrated.

## 1. Connect the server (Claude Desktop)

`~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "hedera": {
      "command": "npx",
      "args": ["-y", "@purplesquirrel/hedera-mcp"],
      "env": { "HEDERA_NETWORK": "testnet", "HEDERA_OPERATOR_ID": "0.0.YOURID" }
    }
  }
}
```
Restart Claude Desktop. You'll see the `hedera` tools appear (hammer icon).

## 2. The script to record (type these, let it work)

1. **"Using the Hedera tools, what's the HBAR exchange rate right now and the latest block?"**
   → instant live Mirror Node reads. Shows it's real, keyless.

2. **"Create a fungible loyalty token 'DemoPoints' (DEMO), 1,000,000 supply, 2 decimals."**
   → agent calls `hedera_create_fungible_token`, returns an unsigned transaction.

3. **"Now airdrop 250 DEMO to 0.0.98 and post 'first airdrop' to a new consensus topic."**
   → agent chains `hedera_token_airdrop` + `hedera_create_topic` + `hedera_submit_message`.

4. **"Decode that token-create transaction so I can see what I'm signing."**
   → `hedera_decode_transaction` — the trust moment: nothing executes without your signature.

## 3. Recording checklist
- Use the funded testnet `HEDERA_OPERATOR_ID` so default payer is set.
- Show the tool calls expanding (Claude Desktop shows each call + result).
- End on the decode step — emphasize **build-only, never holds keys**.
- Keep it under 90s. Export and send to the recruiter / drop on the site.

## 4. Reproducible transcript (no recording needed)
Run `node examples/agent-sim.mjs` for a scripted, build-only walkthrough that prints the same flow as text — useful for a README block or if you'd rather paste a transcript than a video.
