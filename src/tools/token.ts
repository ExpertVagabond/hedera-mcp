/** Token service (HTS): create, mint, burn, transfer, associate, freeze, KYC, pause, wipe, delete + reads. */
import { z } from "zod";
import {
  AccountAllowanceApproveTransaction,
  AccountId,
  CustomFixedFee,
  CustomRoyaltyFee,
  Hbar,
  NftId,
  PublicKey,
  TokenAirdropTransaction,
  TokenAssociateTransaction,
  TokenBurnTransaction,
  TokenCreateTransaction,
  TokenDeleteTransaction,
  TokenDissociateTransaction,
  TokenFreezeTransaction,
  TokenGrantKycTransaction,
  TokenId,
  TokenMintTransaction,
  TokenPauseTransaction,
  TokenRejectTransaction,
  TokenRevokeKycTransaction,
  TokenSupplyType,
  TokenType,
  TokenUnfreezeTransaction,
  TokenUnpauseTransaction,
  TokenUpdateTransaction,
  TokenWipeTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";
import type { Register } from "../types.js";
import { HederaCtx, json } from "../context.js";

function maybeKey(value?: string): PublicKey | undefined {
  return value ? PublicKey.fromString(value) : undefined;
}

export function registerTokenTools(register: Register, ctx: HederaCtx): void {
  register(
    "hedera_create_fungible_token",
    "Build (unsigned) a new fungible token (HTS). Treasury defaults to the payer.",
    {
      name: z.string().describe("Token name"),
      symbol: z.string().describe("Token symbol"),
      decimals: z.number().int().min(0).optional().describe("Decimals (default 0)"),
      initialSupply: z.number().int().min(0).optional().describe("Initial supply in base units (default 0)"),
      treasuryAccountId: z.string().optional().describe("Treasury (defaults to payer)"),
      adminKey: z.string().optional().describe("Admin public key (enables future updates)"),
      supplyKey: z.string().optional().describe("Supply public key (enables mint/burn)"),
      freezeKey: z.string().optional().describe("Freeze public key (enables freeze/unfreeze)"),
      kycKey: z.string().optional().describe("KYC public key (enables grant/revoke KYC)"),
      pauseKey: z.string().optional().describe("Pause public key (enables pause/unpause)"),
      wipeKey: z.string().optional().describe("Wipe public key (enables wipe)"),
      customFeeHbar: z.number().positive().optional().describe("Optional fixed HBAR fee charged on each transfer"),
      feeCollectorAccountId: z.string().optional().describe("Account that collects the custom fee (defaults to treasury)"),
      supplyType: z.enum(["finite", "infinite"]).optional().describe("Default infinite"),
      maxSupply: z.number().int().positive().optional().describe("Required if supplyType=finite"),
      memo: z.string().optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const treasury = AccountId.fromString(a.treasuryAccountId ?? ctx.payer(a.payerAccountId).toString());
      const tx = new TokenCreateTransaction()
        .setTokenName(a.name)
        .setTokenSymbol(a.symbol)
        .setTokenType(TokenType.FungibleCommon)
        .setDecimals(a.decimals ?? 0)
        .setInitialSupply(a.initialSupply ?? 0)
        .setTreasuryAccountId(treasury)
        .setSupplyType(a.supplyType === "finite" ? TokenSupplyType.Finite : TokenSupplyType.Infinite);
      if (a.maxSupply != null) tx.setMaxSupply(a.maxSupply);
      const admin = maybeKey(a.adminKey);
      if (admin) tx.setAdminKey(admin);
      const supply = maybeKey(a.supplyKey);
      if (supply) tx.setSupplyKey(supply);
      const freeze = maybeKey(a.freezeKey);
      if (freeze) tx.setFreezeKey(freeze);
      const kyc = maybeKey(a.kycKey);
      if (kyc) tx.setKycKey(kyc);
      const pause = maybeKey(a.pauseKey);
      if (pause) tx.setPauseKey(pause);
      const wipe = maybeKey(a.wipeKey);
      if (wipe) tx.setWipeKey(wipe);
      if (a.customFeeHbar != null) {
        const collector = AccountId.fromString(a.feeCollectorAccountId ?? treasury.toString());
        tx.setCustomFees([
          new CustomFixedFee().setHbarAmount(new Hbar(a.customFeeHbar)).setFeeCollectorAccountId(collector),
        ]);
      }
      if (a.memo) tx.setTokenMemo(a.memo);
      return ctx.buildAndRender(
        tx,
        `Create fungible token ${a.name} (${a.symbol}) · treasury ${treasury} · supply ${a.initialSupply ?? 0}`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_create_nft_collection",
    "Build (unsigned) a new non-fungible token collection (HTS). A supply key is required to mint.",
    {
      name: z.string(),
      symbol: z.string(),
      treasuryAccountId: z.string().optional(),
      adminKey: z.string().optional(),
      supplyKey: z.string().describe("Supply public key — required to mint NFTs"),
      maxSupply: z.number().int().positive().optional(),
      royaltyNumerator: z.number().int().positive().optional().describe("Royalty fee numerator (use with denominator)"),
      royaltyDenominator: z.number().int().positive().optional().describe("Royalty fee denominator"),
      royaltyFallbackHbar: z.number().positive().optional().describe("Fallback HBAR fee when no fungible value is exchanged"),
      royaltyCollectorAccountId: z.string().optional().describe("Royalty collector (defaults to treasury)"),
      memo: z.string().optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const treasury = AccountId.fromString(a.treasuryAccountId ?? ctx.payer(a.payerAccountId).toString());
      const tx = new TokenCreateTransaction()
        .setTokenName(a.name)
        .setTokenSymbol(a.symbol)
        .setTokenType(TokenType.NonFungibleUnique)
        .setDecimals(0)
        .setInitialSupply(0)
        .setTreasuryAccountId(treasury)
        .setSupplyType(a.maxSupply != null ? TokenSupplyType.Finite : TokenSupplyType.Infinite)
        .setSupplyKey(PublicKey.fromString(a.supplyKey));
      if (a.maxSupply != null) tx.setMaxSupply(a.maxSupply);
      const admin = maybeKey(a.adminKey);
      if (admin) tx.setAdminKey(admin);
      if (a.royaltyNumerator != null && a.royaltyDenominator != null) {
        const collector = AccountId.fromString(a.royaltyCollectorAccountId ?? treasury.toString());
        const royalty = new CustomRoyaltyFee()
          .setNumerator(a.royaltyNumerator)
          .setDenominator(a.royaltyDenominator)
          .setFeeCollectorAccountId(collector);
        if (a.royaltyFallbackHbar != null) {
          royalty.setFallbackFee(new CustomFixedFee().setHbarAmount(new Hbar(a.royaltyFallbackHbar)));
        }
        tx.setCustomFees([royalty]);
      }
      if (a.memo) tx.setTokenMemo(a.memo);
      return ctx.buildAndRender(
        tx,
        `Create NFT collection ${a.name} (${a.symbol}) · treasury ${treasury}`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_mint_fungible",
    "Build (unsigned) a mint of additional fungible token supply.",
    {
      tokenId: z.string(),
      amount: z.number().int().positive().describe("Amount in base units"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new TokenMintTransaction().setTokenId(TokenId.fromString(a.tokenId)).setAmount(a.amount);
      return ctx.buildAndRender(tx, `Mint ${a.amount} of ${a.tokenId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_mint_nft",
    "Build (unsigned) a mint of one or more NFTs with metadata (e.g. IPFS CIDs).",
    {
      tokenId: z.string(),
      metadata: z.array(z.string()).min(1).describe("Per-NFT metadata strings (≤100 bytes each)"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const meta = a.metadata.map((m: string) => Buffer.from(m));
      const tx = new TokenMintTransaction().setTokenId(TokenId.fromString(a.tokenId)).setMetadata(meta);
      return ctx.buildAndRender(tx, `Mint ${meta.length} NFT(s) into ${a.tokenId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_burn_token",
    "Build (unsigned) a burn of fungible amount or specific NFT serials.",
    {
      tokenId: z.string(),
      amount: z.number().int().positive().optional().describe("Fungible amount to burn"),
      serials: z.array(z.number().int().positive()).optional().describe("NFT serials to burn"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new TokenBurnTransaction().setTokenId(TokenId.fromString(a.tokenId));
      if (a.amount != null) tx.setAmount(a.amount);
      if (a.serials?.length) tx.setSerials(a.serials);
      return ctx.buildAndRender(
        tx,
        `Burn ${a.serials?.length ? `serials ${a.serials.join(",")}` : `${a.amount}`} of ${a.tokenId}`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_transfer_token",
    "Build (unsigned) a fungible token transfer between two accounts.",
    {
      tokenId: z.string(),
      fromAccountId: z.string().optional().describe("Sender (defaults to payer)"),
      toAccountId: z.string(),
      amount: z.number().int().positive().describe("Amount in base units"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const token = TokenId.fromString(a.tokenId);
      const from = AccountId.fromString(a.fromAccountId ?? ctx.payer(a.payerAccountId).toString());
      const to = AccountId.fromString(a.toAccountId);
      const tx = new TransferTransaction()
        .addTokenTransfer(token, from, -a.amount)
        .addTokenTransfer(token, to, a.amount);
      return ctx.buildAndRender(tx, `Transfer ${a.amount} of ${a.tokenId} · ${from} → ${to}`, a.payerAccountId);
    },
  );

  register(
    "hedera_transfer_nft",
    "Build (unsigned) an NFT transfer of a specific serial between two accounts.",
    {
      tokenId: z.string(),
      serial: z.number().int().positive(),
      fromAccountId: z.string().optional().describe("Current owner (defaults to payer)"),
      toAccountId: z.string(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const nftId = new NftId(TokenId.fromString(a.tokenId), a.serial);
      const from = AccountId.fromString(a.fromAccountId ?? ctx.payer(a.payerAccountId).toString());
      const to = AccountId.fromString(a.toAccountId);
      const tx = new TransferTransaction().addNftTransfer(nftId, from, to);
      return ctx.buildAndRender(tx, `Transfer NFT ${a.tokenId}#${a.serial} · ${from} → ${to}`, a.payerAccountId);
    },
  );

  register(
    "hedera_associate_token",
    "Build (unsigned) a token association so an account can hold the given token(s).",
    {
      accountId: z.string(),
      tokenIds: z.array(z.string()).min(1),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(a.accountId))
        .setTokenIds(a.tokenIds.map((t: string) => TokenId.fromString(t)));
      return ctx.buildAndRender(tx, `Associate ${a.accountId} ↔ ${a.tokenIds.join(", ")}`, a.payerAccountId);
    },
  );

  register(
    "hedera_dissociate_token",
    "Build (unsigned) a token dissociation.",
    {
      accountId: z.string(),
      tokenIds: z.array(z.string()).min(1),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new TokenDissociateTransaction()
        .setAccountId(AccountId.fromString(a.accountId))
        .setTokenIds(a.tokenIds.map((t: string) => TokenId.fromString(t)));
      return ctx.buildAndRender(tx, `Dissociate ${a.accountId} ↔ ${a.tokenIds.join(", ")}`, a.payerAccountId);
    },
  );

  const freezeLike: Array<[string, string, (t: TokenId, acc: AccountId) => any]> = [
    ["hedera_freeze_token_account", "Freeze an account for a token (blocks transfers)", (t, acc) => new TokenFreezeTransaction().setTokenId(t).setAccountId(acc)],
    ["hedera_unfreeze_token_account", "Unfreeze an account for a token", (t, acc) => new TokenUnfreezeTransaction().setTokenId(t).setAccountId(acc)],
    ["hedera_grant_kyc", "Grant KYC to an account for a token", (t, acc) => new TokenGrantKycTransaction().setTokenId(t).setAccountId(acc)],
    ["hedera_revoke_kyc", "Revoke KYC from an account for a token", (t, acc) => new TokenRevokeKycTransaction().setTokenId(t).setAccountId(acc)],
  ];
  for (const [name, desc, make] of freezeLike) {
    register(
      name,
      `Build (unsigned): ${desc}.`,
      { tokenId: z.string(), accountId: z.string(), payerAccountId: z.string().optional() },
      async (a) => {
        const tx = make(TokenId.fromString(a.tokenId), AccountId.fromString(a.accountId));
        return ctx.buildAndRender(tx, `${desc} · ${a.tokenId} / ${a.accountId}`, a.payerAccountId);
      },
    );
  }

  register(
    "hedera_pause_token",
    "Build (unsigned) a token pause (halts all transfers of the token).",
    { tokenId: z.string(), payerAccountId: z.string().optional() },
    async (a) => {
      const tx = new TokenPauseTransaction().setTokenId(TokenId.fromString(a.tokenId));
      return ctx.buildAndRender(tx, `Pause token ${a.tokenId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_unpause_token",
    "Build (unsigned) a token unpause.",
    { tokenId: z.string(), payerAccountId: z.string().optional() },
    async (a) => {
      const tx = new TokenUnpauseTransaction().setTokenId(TokenId.fromString(a.tokenId));
      return ctx.buildAndRender(tx, `Unpause token ${a.tokenId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_wipe_token",
    "Build (unsigned) a wipe of fungible amount or NFT serials from an account.",
    {
      tokenId: z.string(),
      accountId: z.string(),
      amount: z.number().int().positive().optional(),
      serials: z.array(z.number().int().positive()).optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new TokenWipeTransaction()
        .setTokenId(TokenId.fromString(a.tokenId))
        .setAccountId(AccountId.fromString(a.accountId));
      if (a.amount != null) tx.setAmount(a.amount);
      if (a.serials?.length) tx.setSerials(a.serials);
      return ctx.buildAndRender(tx, `Wipe from ${a.accountId} · token ${a.tokenId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_delete_token",
    "Build (unsigned) a token deletion (requires the admin key to sign).",
    { tokenId: z.string(), payerAccountId: z.string().optional() },
    async (a) => {
      const tx = new TokenDeleteTransaction().setTokenId(TokenId.fromString(a.tokenId));
      return ctx.buildAndRender(tx, `Delete token ${a.tokenId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_update_token",
    "Build (unsigned) an update to a token's name, symbol, memo, or treasury (requires the admin key to sign).",
    {
      tokenId: z.string(),
      name: z.string().optional(),
      symbol: z.string().optional(),
      memo: z.string().optional(),
      treasuryAccountId: z.string().optional(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const tx = new TokenUpdateTransaction().setTokenId(TokenId.fromString(a.tokenId));
      if (a.name != null) tx.setTokenName(a.name);
      if (a.symbol != null) tx.setTokenSymbol(a.symbol);
      if (a.memo != null) tx.setTokenMemo(a.memo);
      if (a.treasuryAccountId) tx.setTreasuryAccountId(AccountId.fromString(a.treasuryAccountId));
      return ctx.buildAndRender(tx, `Update token ${a.tokenId}`, a.payerAccountId);
    },
  );

  register(
    "hedera_token_airdrop",
    "Build (unsigned) a fungible-token airdrop (HIP-904) — auto-associates recipients without prior opt-in.",
    {
      tokenId: z.string(),
      fromAccountId: z.string().optional().describe("Sender (defaults to payer)"),
      toAccountId: z.string(),
      amount: z.number().int().positive().describe("Amount in base units"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const token = TokenId.fromString(a.tokenId);
      const from = AccountId.fromString(a.fromAccountId ?? ctx.payer(a.payerAccountId).toString());
      const to = AccountId.fromString(a.toAccountId);
      const tx = new TokenAirdropTransaction()
        .addTokenTransfer(token, from, -a.amount)
        .addTokenTransfer(token, to, a.amount);
      return ctx.buildAndRender(tx, `Airdrop ${a.amount} of ${a.tokenId} → ${to}`, a.payerAccountId);
    },
  );

  register(
    "hedera_reject_token",
    "Build (unsigned) a token rejection (HIP-904) — returns an unwanted token to its treasury.",
    {
      ownerAccountId: z.string().optional().describe("Holder rejecting (defaults to payer)"),
      tokenId: z.string(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const owner = AccountId.fromString(a.ownerAccountId ?? ctx.payer(a.payerAccountId).toString());
      const tx = new TokenRejectTransaction().setOwnerId(owner).addTokenId(TokenId.fromString(a.tokenId));
      return ctx.buildAndRender(tx, `Reject token ${a.tokenId} (owner ${owner})`, a.payerAccountId);
    },
  );

  register(
    "hedera_approve_token_allowance",
    "Build (unsigned) a fungible-token spending allowance for a spender.",
    {
      tokenId: z.string(),
      ownerAccountId: z.string().optional().describe("Owner (defaults to payer)"),
      spenderAccountId: z.string(),
      amount: z.number().int().positive().describe("Allowance amount in base units"),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const owner = AccountId.fromString(a.ownerAccountId ?? ctx.payer(a.payerAccountId).toString());
      const tx = new AccountAllowanceApproveTransaction().approveTokenAllowance(
        TokenId.fromString(a.tokenId),
        owner,
        AccountId.fromString(a.spenderAccountId),
        a.amount,
      );
      return ctx.buildAndRender(
        tx,
        `Approve ${a.amount} of ${a.tokenId} · ${owner} → ${a.spenderAccountId}`,
        a.payerAccountId,
      );
    },
  );

  register(
    "hedera_approve_nft_allowance",
    "Build (unsigned) an NFT allowance for all serials of a collection (approve-for-all).",
    {
      tokenId: z.string(),
      ownerAccountId: z.string().optional().describe("Owner (defaults to payer)"),
      spenderAccountId: z.string(),
      payerAccountId: z.string().optional(),
    },
    async (a) => {
      const owner = AccountId.fromString(a.ownerAccountId ?? ctx.payer(a.payerAccountId).toString());
      const tx = new AccountAllowanceApproveTransaction().approveTokenNftAllowanceAllSerials(
        TokenId.fromString(a.tokenId),
        owner,
        AccountId.fromString(a.spenderAccountId),
      );
      return ctx.buildAndRender(
        tx,
        `Approve all NFTs of ${a.tokenId} · ${owner} → ${a.spenderAccountId}`,
        a.payerAccountId,
      );
    },
  );

  // ---- Mirror Node reads (keyless) ----

  register(
    "hedera_get_token_info",
    "Read token info (type, supply, keys, custom fees) from the Mirror Node.",
    { tokenId: z.string() },
    async (a) => json(await ctx.mirror(`/api/v1/tokens/${encodeURIComponent(a.tokenId)}`)),
  );

  register(
    "hedera_get_nft_info",
    "Read a specific NFT's info (owner, metadata, serial) from the Mirror Node.",
    { tokenId: z.string(), serial: z.number().int().positive() },
    async (a) =>
      json(await ctx.mirror(`/api/v1/tokens/${encodeURIComponent(a.tokenId)}/nfts/${a.serial}`)),
  );
}
