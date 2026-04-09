---
name: metaplex
description: Metaplex development on Solana — NFTs, tokens, compressed NFTs, candy machines, token launches, autonomous agents. Use when working with Token Metadata, Core, Bubblegum, Candy Machine, Genesis, Agent Registry, or the mplx CLI.
license: Apache-2.0
metadata:
  author: metaplex-foundation
  version: "0.3.0"
  openclaw: {"emoji":"💎","os":["darwin","linux","win32"],"requires":{"bins":["node"]},"homepage":"https://metaplex.com/docs"}
---

# Metaplex Development Skill

## Overview

Metaplex provides the standard infrastructure for NFTs and tokens on Solana:
- **Agent Registry**: On-chain agent identity, wallets, and execution delegation for MPL Core assets
- **Genesis**: Token launch protocol with fair distribution + liquidity graduation
- **Core**: Next-gen NFT standard (recommended for new NFT projects)
- **Token Metadata**: Fungible tokens + legacy NFTs/pNFTs
- **Bubblegum**: Compressed NFTs (cNFTs) using Merkle trees — massive scale at minimal cost
- **Candy Machine**: NFT drops with configurable minting rules

## Tool Selection

> **Prefer CLI over SDK** for direct execution. Use SDK only when user specifically needs code.

| Approach | When to Use |
|----------|-------------|
| **CLI (`mplx`)** | Default choice - direct execution, no code needed |
| **Umi SDK** | User needs code — default SDK choice. Covers all programs (TM, Core, Bubblegum, Genesis) |
| **Kit SDK** | User specifically uses @solana/kit, or asks for minimal dependencies. Token Metadata only — no Core/Bubblegum/Genesis support |

## Task Router

> **IMPORTANT**: You MUST read the detail file for your task BEFORE executing any command or writing any code. The command syntax, required flags, setup steps, and batching rules are ONLY in the detail files. Do NOT guess commands from memory.

| Task Type | Read This File |
|-----------|----------------|
| Any CLI operation (agent guidelines, batching, explorer links) | `./references/cli.md` |
| CLI: Agent Registry (identity, delegation, revocation, token linking) | `./references/cli.md` + `./references/cli-agent.md` |
| CLI: Core NFTs/Collections | `./references/cli.md` + `./references/cli-core.md` + `./references/metadata-json.md` |
| CLI: Token Metadata NFTs | `./references/cli.md` + `./references/cli-token-metadata.md` + `./references/metadata-json.md` |
| CLI: Compressed NFTs (Bubblegum) | `./references/cli.md` + `./references/cli-bubblegum.md` + `./references/metadata-json.md` |
| CLI: Candy Machine (NFT drops) | `./references/cli.md` + `./references/cli-candy-machine.md` + `./references/metadata-json.md` |
| CLI: Token launch / bonding curve (Genesis) | `./references/cli.md` + `./references/cli-genesis.md` |
| CLI: Execute / asset-signer wallets / agent vault | `./references/cli.md` + `./references/cli-core.md` (execute section) |
| SDK: Execute / asset-signer PDA / agent vault | `./references/sdk-umi.md` + `./references/sdk-core.md` (execute section) |
| CLI: Fungible tokens | `./references/cli.md` + `./references/cli-toolbox.md` |
| SDK setup (Umi) | `./references/sdk-umi.md` |
| SDK: Core NFTs | `./references/sdk-umi.md` + `./references/sdk-core.md` + `./references/metadata-json.md` |
| SDK: Token Metadata | `./references/sdk-umi.md` + `./references/sdk-token-metadata.md` + `./references/metadata-json.md` |
| SDK: Compressed NFTs (Bubblegum) | `./references/sdk-umi.md` + `./references/sdk-bubblegum.md` + `./references/metadata-json.md` |
| SDK: Token Metadata with Kit | `./references/sdk-token-metadata-kit.md` + `./references/metadata-json.md` |
| SDK: Agent Registry (identity, wallets, delegation) | `./references/sdk-umi.md` + `./references/sdk-agent.md` |
| SDK: Token launch + bonding curve swaps (Genesis) | `./references/sdk-umi.md` + `./references/sdk-genesis.md` |
| SDK: Low-level Genesis (custom buckets, presale, vesting) | `./references/sdk-umi.md` + `./references/sdk-genesis-low-level.md` |
| Off-chain metadata JSON format/schema (NFT or token) | `./references/metadata-json.md` |
| Account structures, PDAs, concepts | `./references/concepts.md` |
| CLI errors, localnet issues | `./references/cli-troubleshooting.md` |

## CLI Capabilities

The `mplx` CLI can handle most Metaplex operations directly. **Read `./references/cli.md` for agent guidelines (batching, JSON output, explorer links), then the program-specific file.**

> **CLI v0.1.0 breaking changes** (for agents/scripts migrating from older versions):
> - `--json <file>` (used to pass an offchain metadata file path) is now `--offchain <file>`. `--json` is now the standard OCLIF flag for machine-readable output.
> - All commands now return structured JSON when `--json` is passed — use this for programmatic/agent use.

| Task | CLI Support |
|------|-------------|
| Register agent identity | ✅ |
| Fetch agent data | ✅ |
| Revoke execution delegation | ✅ |
| Set agent token (Genesis link) | ✅ (requires asset-signer mode) |
| Create fungible token | ✅ |
| Create Core NFT/Collection | ✅ |
| Create TM NFT/pNFT | ✅ |
| Transfer TM NFTs | ✅ |
| Transfer fungible tokens | ✅ |
| Transfer Core NFTs | ✅ |
| Upload to Irys | ✅ |
| Candy Machine drop | ✅ (setup/config/insert — minting requires SDK) |
| Compressed NFTs (cNFTs) | ✅ (batch limit ~100, use SDK for larger) |
| Execute (asset-signer wallets) | ✅ |
| Check SOL balance / Airdrop | ✅ |
| Query assets by owner/collection | ❌ SDK only (DAS API) |
| Token launch (Genesis) | ✅ |
| Bonding curve swap (Genesis) | ✅ |

## Program IDs

```
Agent Identity:  1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p
Agent Tools:     TLREGni9ZEyGC3vnPZtqUh95xQ8oPqJSvNjvB7FGK8S
Genesis:         GNS1S5J5AspKXgpjz6SvKL66kPaKWAhaGRhCqPRxii2B
Core:            CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d
Token Metadata:  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s
Bubblegum V1:    BGUMAp9SX3uS4efGcFjPjkAQZ4cUNZhtHaMq64nrGf9D
Bubblegum V2:    BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY
Core Candy:      CMACYFENjoBMHzapRXyo1JZkVS6EtaDDzkjMrmQLvr4J
```

## Quick Decision Guide

### Autonomous Agents

Use **Agent Registry** to register on-chain identity and execution delegation for MPL Core assets. The **Mint Agent API** (`mintAndSubmitAgent`) is the recommended path — it creates the Core asset and registers identity in a single transaction. For existing assets, use `registerIdentityV1` directly. Any Core asset already has a built-in wallet (Asset Signer PDA) via Core's Execute hook — the registry adds discoverable identity records and lets owners delegate an off-chain executive to operate the agent. Agents can optionally link a Genesis token via `setAgentTokenV1`. Read `./references/cli-agent.md` (CLI) or `./references/sdk-umi.md` + `./references/sdk-agent.md` (SDK).

### Token Launches (Token Generation Event / Fair Launch / Bonding Curve)

Use **Genesis**. The **Launch API** (`genesis launch create` / `createAndRegisterLaunch`) is recommended — it handles everything in one step. Two launch types:
- **`launchpool`** (default): Configurable allocations, 48h deposit, team vesting support
- **`bonding-curve`**: Instant bonding curve (constant product AMM) — no deposit window, trading starts immediately, auto-graduates to Raydium CPMM on sell-out. Supports creator fees, first buy, and agent mode.

Read `./references/cli.md` + `./references/cli-genesis.md` (CLI) or `./references/sdk-genesis.md` (SDK launch flow). For custom buckets/presale/vesting, use `./references/sdk-genesis-low-level.md`.

### NFTs: Core vs Token Metadata

| Choose | When |
|--------|------|
| **Core** | New NFT projects, lower cost (87% cheaper), plugins, royalty enforcement |
| **Token Metadata** | Existing TM collections, need editions, pNFTs for legacy compatibility |

### Compressed NFTs (Massive Scale)

Use **Bubblegum** when minting thousands+ of NFTs at minimal cost. See `./references/cli-bubblegum.md` (CLI) or `./references/sdk-bubblegum.md` (SDK).

### Fungible Tokens

Always use **Token Metadata**. Read `./references/cli-toolbox.md` for CLI commands.

### NFT Drops

Use **Core Candy Machine**. Read `./references/cli.md` + `./references/cli-candy-machine.md`.

### Asset as Agent / Vault / Wallet (Execute)

Use **Core Execute** when an asset (NFT, agent, vault) needs to hold SOL/tokens, transfer funds, sign transactions, or own other assets. Every Core asset has a signer PDA that can act as an autonomous wallet. Read `./references/cli-core.md` (CLI) or `./references/sdk-core.md` (SDK), execute section.

## External Resources

- Documentation: https://metaplex.com/docs
- Agent Registry: https://metaplex.com/docs/agents
- Genesis: https://metaplex.com/docs/smart-contracts/genesis
- Core: https://metaplex.com/docs/smart-contracts/core
- Token Metadata: https://metaplex.com/docs/smart-contracts/token-metadata
- Bubblegum: https://metaplex.com/docs/smart-contracts/bubblegum-v2
- Candy Machine: https://metaplex.com/docs/smart-contracts/core-candy-machine
# Metaplex Concepts Reference

## Token Standards

### Token Metadata Standards

| Standard | Use Case | Accounts |
|----------|----------|----------|
| `Fungible` | SPL tokens, memecoins, utility tokens | Mint + Metadata |
| `FungibleAsset` | Semi-fungible, non-divisible | Mint + Metadata |
| `NonFungible` | Standard NFT (1/1) | Mint + Metadata + MasterEdition |
| `NonFungibleEdition` | Print editions | Mint + Metadata + Edition |
| `ProgrammableNonFungible` | NFT with enforced royalties (pNFT) | + TokenRecord |
| `ProgrammableNonFungibleEdition` | Print edition of a pNFT | + TokenRecord + Edition |

### Core vs Token Metadata

| Aspect | Core | Token Metadata |
|--------|------|----------------|
| Accounts per NFT | 1 | 3-4 |
| Mint cost | ~0.0029 SOL | ~0.022 SOL |
| Compute units | ~17,000 CU | ~205,000 CU |
| Royalty enforcement | Built-in | Requires pNFT |
| Plugins | Yes | No |
| Best for | New NFT projects | Fungibles, legacy NFTs |

---

## Account Structures

### Token Metadata Accounts

```
Metadata Account
├── key: Key (1 byte)
├── updateAuthority: PublicKey
├── mint: PublicKey
├── name: string (max 32)
├── symbol: string (max 10)
├── uri: string (max 200)
├── sellerFeeBasisPoints: u16
├── creators: Option<Vec<Creator>>
├── primarySaleHappened: bool
├── isMutable: bool
├── editionNonce: Option<u8>
├── tokenStandard: Option<TokenStandard>
├── collection: Option<Collection>
├── uses: Option<Uses>
├── collectionDetails: Option<CollectionDetails>
└── programmableConfig: Option<ProgrammableConfig>

MasterEdition Account
├── key: Key
├── supply: u64
└── maxSupply: Option<u64>

TokenRecord Account (pNFTs only)
├── key: Key
├── bump: u8
├── state: TokenState
├── delegate: Option<PublicKey>
├── delegateRole: Option<TokenDelegateRole>
└── lockedTransfer: Option<PublicKey>
```

### Core Asset Structure

```
Asset Account (Single Account)
├── key: Key
├── owner: PublicKey
├── updateAuthority: UpdateAuthority
├── name: string
├── uri: string
├── seq: Option<u64>
└── plugins: Vec<PluginHeader + Plugin>

Collection Account
├── key: Key
├── updateAuthority: PublicKey
├── name: string
├── uri: string
├── numMinted: u32
├── currentSize: u32
└── plugins: Vec<PluginHeader + Plugin>
```

---

## PDA Seeds

### Token Metadata PDAs

| Account | Seeds |
|---------|-------|
| Metadata | `['metadata', program_id, mint]` |
| Master Edition | `['metadata', program_id, mint, 'edition']` |
| Edition | `['metadata', program_id, mint, 'edition']` |
| Token Record | `['metadata', program_id, mint, 'token_record', token]` |
| Collection Authority | `['metadata', program_id, mint, 'collection_authority', authority]` |
| Use Authority | `['metadata', program_id, mint, 'user', use_authority]` |

### Agent Registry Accounts

```
AgentIdentityV2 (104 bytes) — current version, created by RegisterIdentityV1
├── key: u8 (discriminator)
├── bump: u8
├── _padding: [u8; 6]
├── asset: Pubkey (the MPL Core asset)
├── agentToken: OptionalPubkey (32 bytes — Genesis token mint, set via SetAgentTokenV1)
└── _reserved: [u8; 32]

AgentIdentityV1 (40 bytes) — legacy, auto-upgraded to V2 by SetAgentTokenV1
├── key: u8 (discriminator)
├── bump: u8
├── _padding: [u8; 6]
└── asset: Pubkey (the MPL Core asset)

ExecutiveProfileV1 (40 bytes)
├── key: u8 (discriminator)
├── _padding: [u8; 7]
└── authority: Pubkey

ExecutionDelegateRecordV1 (104 bytes)
├── key: u8 (discriminator)
├── bump: u8
├── _padding: [u8; 6]
├── executiveProfile: Pubkey
├── authority: Pubkey
└── agentAsset: Pubkey
```

### Agent Registry PDAs

| Account | Seeds |
|---------|-------|
| Agent Identity | `['agent_identity', asset]` |
| Executive Profile | `['executive_profile', authority]` |
| Execution Delegate Record | `['execution_delegate_record', executive_profile, agent_asset]` |

---

## Authorities

### Token Metadata Authorities

| Authority | Can |
|-----------|-----|
| Update Authority | Update metadata, verify creators, verify collection |
| Mint Authority | Mint new tokens (fungibles) |
| Freeze Authority | Freeze token accounts |

### Core Authorities

| Authority | Can |
|-----------|-----|
| Owner | Transfer, burn, add owner-managed plugins |
| Update Authority | Update metadata, add authority-managed plugins |

---

## Collection Patterns

### Core Collections

- Assets created with `collection` param are **auto-verified**
- No separate verification step needed

### Token Metadata Collections

- Collection is an NFT itself
- Items reference collection but start **unverified**
- Must call `verifyCollectionV1` as collection authority

---

## Core Plugin Types

### Owner-Managed
- `TransferDelegate` - Allow another to transfer
- `FreezeDelegate` - Allow another to freeze
- `BurnDelegate` - Allow another to burn

### Authority-Managed
- `Royalties` - Enforce royalties on transfers
- `UpdateDelegate` - Allow another to update
- `Attributes` - On-chain attributes

### Permanent (Immutable after adding)
- `PermanentTransferDelegate`
- `PermanentFreezeDelegate`
- `PermanentBurnDelegate`

---

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `InvalidTokenStandard` | Wrong standard for operation | Check asset's actual token standard |
| `InvalidAuthority` | Signer doesn't match authority | Verify update/mint authority |
| `CollectionNotVerified` | Collection not verified | Call `verifyCollectionV1` |
| `TokenRecordNotFound` | Missing TokenRecord for pNFT | Include token record PDA |
| `PluginNotFound` | Plugin doesn't exist | Add plugin first or check name |
| `InsufficientFunds` | Not enough SOL | Fund wallet |
| `Invalid data enum variant` | Wrong JSON format | Check array format, type field, ruleSet object |

---

## Cost Comparison

| Operation | Token Metadata | Core | Savings |
|-----------|---------------|------|---------|
| Mint NFT | ~0.022 SOL | ~0.0029 SOL | 87% |
| Compute Units | ~205,000 CU | ~17,000 CU | 92% |
| Accounts | 3-4 | 1 | 75% |

---

## Genesis Concepts

### Launch Types

- **Launchpool**: Configurable allocations, 48-hour deposit window, team vesting support, custom Raydium liquidity split.
- **Bonding Curve**: Instant constant product AMM — no deposit window, trading starts immediately. Optional creator fees, first buy, and agent mode. Auto-graduates to Raydium CPMM when all tokens are sold.

Both types have a total supply of 1 billion tokens and graduate to Raydium liquidity.

### Lifecycle

```text
Initialize → Add Buckets → Finalize (irreversible) → Deposit Period → Transition → Graduation → Claim Period
```

- **Initialize**: Creates a Genesis account + the token mint. All configuration happens here (name, symbol, supply, quote mint).
- **Add Buckets**: Configure how tokens are distributed. See Bucket Types below.
- **Finalize**: Locks the configuration. No more buckets can be added. **Irreversible.** Requires 100% of supply allocated to buckets.
- **Deposit Period**: Users deposit SOL (quote token) into the LaunchPool bucket.
- **Transition**: After deposit period ends, executes end behaviors (e.g., routes deposited SOL to outflow buckets). Call `triggerBehaviorsV2`.
- **Graduation**: LP tokens are graduated to Raydium. Call `graduateToRaydiumCpmmV2`.
- **Claim Period**: Users claim tokens proportional to their deposit.

### Bucket Types

| Bucket | Purpose | User Interaction |
|--------|---------|-----------------|
| **LaunchPool** | Pro-rata allocation — users deposit SOL, receive tokens proportionally | deposit / withdraw / claim |
| **Presale** | Fixed-price allocation (price = quoteCap / allocation), first-come-first-served | deposit / withdraw / claim |
| **BondingCurve** | Constant-product AMM with virtual reserves | swap (buy/sell) |
| **Unlocked** | Team/treasury — tokens go directly to a recipient, no deposits | claim only |
| **Vault** | Holds SOL received from end behaviors | deposit / withdraw |
| **RaydiumCpmm** | Raydium LP graduation — receives tokens + SOL, creates LP | graduation |
| **Streamflow** | Vesting via Streamflow — tokens unlock over time | lock / claim via Streamflow |

### Fees

Genesis charges protocol-level fees on deposits and withdrawals. For current fee rates, see: https://metaplex.com/docs/protocol-fees

### Condition Objects

Buckets use condition objects for timing (deposit start/end, claim start/end). Use the helper:

```typescript
import { createTimeAbsoluteCondition } from '@metaplex-foundation/genesis';

const condition = createTimeAbsoluteCondition(BigInt(unixTimestamp));
```

This handles the required padding and triggered timestamp fields automatically. Other condition types: `createTimeRelativeCondition()` (relative to another bucket), `createNeverCondition()` (permanently locked).

### End Behaviors

After a LaunchPool's deposit period ends, `endBehaviors` define what happens to the deposited SOL:

```typescript
{
  __kind: 'SendQuoteTokenPercentage',  // Send % of collected SOL to another bucket
  padding: Array(4).fill(0),           // Reserved bytes (required)
  destinationBucket: publicKey(bucket), // Target bucket address (e.g., Unlocked bucket for team)
  percentageBps: 10000,                // 10000 = 100% of collected SOL
  processed: false,                    // Set by program after execution — always pass false
}
```

Available end behavior types:
- `SendQuoteTokenPercentage` — Route a percentage of collected SOL to another bucket
- `BaseTokenRollover` — Move a percentage of unsold base tokens to another bucket
- `SendStartPrice` — Send the starting price (SOL) to a destination bucket
- `ReallocateBaseTokensOnFailure` — On minimum threshold failure, move tokens to another bucket

### Claim Schedules

Buckets can have claim schedules that control when users can claim tokens:

```typescript
import { createClaimSchedule, createNeverClaimSchedule } from '@metaplex-foundation/genesis';

// Linear vesting with cliff
const schedule = createClaimSchedule({
  startTime: BigInt(startTimestamp),  // When linear vesting begins
  endTime: BigInt(endTimestamp),      // When vesting completes
  cliffTime: BigInt(cliffTimestamp),  // Cliff date
  cliffAmountBps: 1000,              // 10% unlocked at cliff
  period: 2_592_000n,                // Release every 30 days
});

// Permanently locked (e.g., LP tokens that should never vest)
const locked = createNeverClaimSchedule();
```

### Allowlists

Presale and launch pool buckets support merkle-tree allowlists to restrict who can deposit:

```typescript
import { prepareAllowlist } from '@metaplex-foundation/genesis';

const { root, proofs, treeHeight } = prepareAllowlist([
  { address: publicKey('Addr111...') },
  { address: publicKey('Addr222...') },
]);
```

Pass `allowlist` config when adding a bucket, and provide merkle proofs as remaining accounts when depositing.

### Token Supply Decimals

Genesis tokens default to 9 decimals. Supply is specified in base units:

| Human Amount | Base Units (9 decimals) |
|---|---|
| 1 token | `1_000_000_000n` |
| 1,000,000 tokens | `1_000_000_000_000_000n` |
| 1,000,000,000 tokens | `1_000_000_000_000_000_000n` |

# Core SDK Reference (Umi)

Umi SDK operations for creating and managing Core NFTs and collections.

> **Prerequisites**: Set up Umi first — see `./sdk-umi.md` for installation and basic setup.
> **Docs**: https://metaplex.com/docs/smart-contracts/core

> **Important**: When passing plugins, use the helper functions (`create`, `createCollection`, `addPlugin`, `addCollectionPlugin`, `updatePlugin`, `removePlugin`). The raw generated functions (`createV1`, `addPluginV1`, etc.) expect a different internal plugin format and will error with the friendly `{ type: 'Royalties', ... }` syntax.

> **Fetch-first pattern**: The helpers `update`, `burn`, `freezeAsset`, `thawAsset` require a **fetched** asset object (from `fetchAsset`), not just an address. This is because they automatically derive external plugin adapter accounts.

> **Off-chain metadata**: Before creating an asset, upload a metadata JSON to Arweave/IPFS. See `./metadata-json.md` for the canonical schema. The resulting URI is passed as the `uri` parameter.

---

## Create Asset

```typescript
import { create, fetchAsset } from '@metaplex-foundation/mpl-core';
import { generateSigner } from '@metaplex-foundation/umi';

const asset = generateSigner(umi);

await create(umi, {
  asset,
  name: 'My Core NFT',
  uri: 'https://arweave.net/xxx',
}).sendAndConfirm(umi);

const fetchedAsset = await fetchAsset(umi, asset.publicKey);
```

## Create Collection

```typescript
import { createCollection } from '@metaplex-foundation/mpl-core';

const collection = generateSigner(umi);

await createCollection(umi, {
  collection,
  name: 'My Collection',
  uri: 'https://arweave.net/xxx',
}).sendAndConfirm(umi);
```

## Create Collection with Plugins (Single Step)

```typescript
import { createCollection, ruleSet } from '@metaplex-foundation/mpl-core';

const collection = generateSigner(umi);

await createCollection(umi, {
  collection,
  name: 'My Collection',
  uri: 'https://arweave.net/xxx',
  plugins: [
    {
      type: 'Royalties',
      basisPoints: 500,
      creators: [{ address: umi.identity.publicKey, percentage: 100 }],
      ruleSet: ruleSet('None'),
    },
  ],
}).sendAndConfirm(umi);
```

## Create Asset in Collection

```typescript
await create(umi, {
  asset: generateSigner(umi),
  collection,  // pass the fetched collection object, not just the publicKey
  name: 'Asset #1',
  uri: 'https://arweave.net/xxx',
}).sendAndConfirm(umi);
```

> The `create` helper requires a collection **object** (from `fetchCollection` or `createCollection`'s signer), not a bare public key. Passing `collection.publicKey` silently creates the asset without a collection association.

## Create Asset with Plugins (Single Step)

```typescript
import { create, ruleSet } from '@metaplex-foundation/mpl-core';

await create(umi, {
  asset: generateSigner(umi),
  name: 'My NFT with Royalties',
  uri: 'https://arweave.net/xxx',
  plugins: [
    {
      type: 'Royalties',
      basisPoints: 500,
      creators: [{ address: creatorAddress, percentage: 100 }],
      ruleSet: ruleSet('None'),
    },
  ],
}).sendAndConfirm(umi);
```

## Update Asset

Requires fetching the asset first (see "Fetch-first pattern" note above).

```typescript
import { update, fetchAsset } from '@metaplex-foundation/mpl-core';

const asset = await fetchAsset(umi, assetAddress);

await update(umi, {
  asset,
  name: 'Updated Name',
  uri: 'https://arweave.net/new-uri',
}).sendAndConfirm(umi);
```

> If the asset's `updateAuthority.type` is `'Collection'` (update authority delegated to the collection), also pass the fetched collection: `await update(umi, { asset, collection: await fetchCollection(umi, collectionAddr), name: '...' })`. By default, assets have `Address` update authority and don't need this.

## Update Collection

```typescript
import { updateCollection } from '@metaplex-foundation/mpl-core';

await updateCollection(umi, {
  collection: collectionAddress,
  name: 'Updated Collection Name',
  uri: 'https://arweave.net/new-uri',
}).sendAndConfirm(umi);
```

## Burn Asset

Requires fetching the asset first.

```typescript
import { burn, fetchAsset } from '@metaplex-foundation/mpl-core';

const asset = await fetchAsset(umi, assetAddress);
await burn(umi, { asset }).sendAndConfirm(umi);
```

> Same as `update`: only pass `collection` if the asset's `updateAuthority.type` is `'Collection'`.

## Fetch

```typescript
import {
  fetchAsset,
  fetchCollection,
  fetchAssetsByOwner,
  fetchAssetsByCollection,
} from '@metaplex-foundation/mpl-core';

// Single asset
const asset = await fetchAsset(umi, assetAddress);

// Single collection
const collection = await fetchCollection(umi, collectionAddress);

// All assets owned by a wallet
const ownerAssets = await fetchAssetsByOwner(umi, ownerAddress);

// All assets in a collection
const collectionAssets = await fetchAssetsByCollection(umi, collectionAddress);
```

> `fetchAssetsByOwner` and `fetchAssetsByCollection` use GPA (getProgramAccounts) queries. They may throw deserialization errors if the wallet/collection has burned asset account remnants. For production, prefer DAS API queries (see `./sdk-umi.md` DAS section).

## Transfer Asset

```typescript
import { transferV1 } from '@metaplex-foundation/mpl-core';

await transferV1(umi, {
  asset: assetAddress,
  newOwner: recipientAddress,
}).sendAndConfirm(umi);
```

If the asset is in a collection, pass `collection`:

```typescript
await transferV1(umi, {
  asset: assetAddress,
  newOwner: recipientAddress,
  collection: collectionAddress,
}).sendAndConfirm(umi);
```

---

## Plugins

Available plugin types: `Royalties`, `FreezeDelegate`, `BurnDelegate`, `TransferDelegate`, `UpdateDelegate`, `PermanentFreezeDelegate`, `PermanentTransferDelegate`, `PermanentBurnDelegate`, `Attributes`, `Edition`, `MasterEdition`, `AddBlocker`, `ImmutableMetadata`, `VerifiedCreators`, `Autograph`.

### Add Plugin — After Creation

```typescript
import { addPlugin, ruleSet } from '@metaplex-foundation/mpl-core';

// Add to asset
await addPlugin(umi, {
  asset: assetAddress,
  plugin: {
    type: 'Royalties',
    basisPoints: 500,
    creators: [{ address: creatorAddress, percentage: 100 }],
    ruleSet: ruleSet('None'),
  },
}).sendAndConfirm(umi);
```

### Add Plugin to Collection

```typescript
import { addCollectionPlugin, ruleSet } from '@metaplex-foundation/mpl-core';

await addCollectionPlugin(umi, {
  collection: collectionAddress,
  plugin: {
    type: 'Royalties',
    basisPoints: 500,
    creators: [{ address: creatorAddress, percentage: 100 }],
    ruleSet: ruleSet('None'),
  },
}).sendAndConfirm(umi);
```

### Update Plugin

```typescript
import { updatePlugin } from '@metaplex-foundation/mpl-core';

// Update asset plugin (e.g., change royalty percentage)
await updatePlugin(umi, {
  asset: assetAddress,
  plugin: {
    type: 'Royalties',
    basisPoints: 750,
    creators: [{ address: creatorAddress, percentage: 100 }],
    ruleSet: ruleSet('None'),
  },
}).sendAndConfirm(umi);

// Update collection plugin
import { updateCollectionPlugin } from '@metaplex-foundation/mpl-core';

await updateCollectionPlugin(umi, {
  collection: collectionAddress,
  plugin: {
    type: 'Royalties',
    basisPoints: 750,
    creators: [{ address: creatorAddress, percentage: 100 }],
    ruleSet: ruleSet('None'),
  },
}).sendAndConfirm(umi);
```

### Remove Plugin

```typescript
import { removePlugin, removeCollectionPlugin } from '@metaplex-foundation/mpl-core';

// From asset
await removePlugin(umi, {
  asset: assetAddress,
  plugin: { type: 'FreezeDelegate' },
}).sendAndConfirm(umi);

// From collection
await removeCollectionPlugin(umi, {
  collection: collectionAddress,
  plugin: { type: 'Attributes' },
}).sendAndConfirm(umi);
```

### Delegate Plugin Authority

```typescript
import { approvePluginAuthority } from '@metaplex-foundation/mpl-core';

await approvePluginAuthority(umi, {
  asset: assetAddress,
  plugin: { type: 'FreezeDelegate' },
  newAuthority: { type: 'Address', address: delegateAddress },
}).sendAndConfirm(umi);
```

### Revoke Plugin Authority

Owner-managed plugins (Freeze, Transfer, Burn delegates) revert to `Owner` authority. Authority-managed plugins revert to `UpdateAuthority`. Owner-managed delegates are **auto-revoked on transfer**.

```typescript
import { revokePluginAuthority } from '@metaplex-foundation/mpl-core';

await revokePluginAuthority(umi, {
  asset: assetAddress,
  plugin: { type: 'FreezeDelegate' },
}).sendAndConfirm(umi);
```

---

## Freeze / Thaw

Requires `FreezeDelegate` plugin on the asset. The delegate authority (or owner, if no delegate) can freeze/thaw. Requires fetching the asset first.

```typescript
import { freezeAsset, thawAsset, fetchAsset } from '@metaplex-foundation/mpl-core';

const asset = await fetchAsset(umi, assetAddress);

// Freeze (prevents transfer and burn)
await freezeAsset(umi, {
  asset,
  delegate: delegateSigner.publicKey,
  authority: delegateSigner,
}).sendAndConfirm(umi);

// Thaw (re-enables transfer and burn)
const frozenAsset = await fetchAsset(umi, assetAddress);
await thawAsset(umi, {
  asset: frozenAsset,
  delegate: delegateSigner.publicKey,
  authority: delegateSigner,
}).sendAndConfirm(umi);
```

Alternative: use `updatePlugin` to toggle freeze state directly:

```typescript
import { updatePlugin } from '@metaplex-foundation/mpl-core';

await updatePlugin(umi, {
  asset: assetAddress,
  plugin: { type: 'FreezeDelegate', frozen: true },  // or false to thaw
}).sendAndConfirm(umi);
```

---

## Soulbound NFTs

Non-transferable tokens using `PermanentFreezeDelegate` plugin set to `frozen: true`. The `Permanent` prefix means the plugin can only be added at creation time.

### Truly Soulbound (No One Can Unfreeze)

```typescript
await create(umi, {
  asset: generateSigner(umi),
  name: 'Soulbound Token',
  uri: 'https://arweave.net/xxx',
  plugins: [
    {
      type: 'PermanentFreezeDelegate',
      frozen: true,
      authority: { type: 'None' },  // Permanently frozen — no one can thaw
    },
  ],
}).sendAndConfirm(umi);
```

### Controllable Soulbound (Authority Can Unfreeze)

```typescript
await create(umi, {
  asset: generateSigner(umi),
  name: 'Revocable Soulbound',
  uri: 'https://arweave.net/xxx',
  plugins: [
    {
      type: 'PermanentFreezeDelegate',
      frozen: true,
      authority: { type: 'Address', address: adminAddress },  // Admin can unfreeze
    },
  ],
}).sendAndConfirm(umi);
```

### Soulbound Collection

All assets in this collection are frozen at collection level:

```typescript
await createCollection(umi, {
  collection: generateSigner(umi),
  name: 'Soulbound Collection',
  uri: 'https://arweave.net/xxx',
  plugins: [
    {
      type: 'PermanentFreezeDelegate',
      frozen: true,
      authority: { type: 'UpdateAuthority' },  // Update authority can unfreeze
    },
  ],
}).sendAndConfirm(umi);
```

To toggle collection freeze:

```typescript
import { updateCollectionPlugin } from '@metaplex-foundation/mpl-core';

await updateCollectionPlugin(umi, {
  collection: collectionAddress,
  plugin: { type: 'PermanentFreezeDelegate', frozen: false },
}).sendAndConfirm(umi);
```

---

## Execute (Asset-Signer PDA)

Every MPL Core asset has a deterministic **signer PDA** that can hold SOL, tokens, and own other assets. The `execute` function wraps arbitrary instructions so the PDA signs them on-chain via CPI.

> **Permission model**: Only the asset **owner** can call `execute`. Update authority cannot execute.
> **Collection assets**: Pass the `collection` parameter only when `asset.updateAuthority.type === 'Collection'`. Omitting it causes `MissingCollection`; passing it when the asset has `Address`-type update authority causes `InvalidCollection`.

### Single Instruction

```typescript
import { execute, findAssetSignerPda, fetchAsset } from '@metaplex-foundation/mpl-core';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import { createNoopSigner, publicKey, sol } from '@metaplex-foundation/umi';

const asset = await fetchAsset(umi, assetAddress);
const assetSigner = findAssetSignerPda(umi, { asset: asset.publicKey });

await execute(umi, {
  asset,
  instructions: transferSol(umi, {
    source: createNoopSigner(publicKey(assetSigner)),
    destination: recipientAddress,
    amount: sol(0.5),
  }),
}).sendAndConfirm(umi);
```

### Multiple Instructions

Chain instructions using `.add()` on a `TransactionBuilder`:

```typescript
await execute(umi, {
  asset,
  instructions: transferSol(umi, {
    source: createNoopSigner(publicKey(assetSigner)),
    destination: recipientAddress,
    amount: sol(0.25),
  }).add(
    transferSol(umi, {
      source: createNoopSigner(publicKey(assetSigner)),
      destination: recipientAddress,
      amount: sol(0.25),
    })
  ),
}).sendAndConfirm(umi);
```

### With Raw Instruction Array

Extract instructions from a builder and pass as `Instruction[]`. When using raw instructions, provide explicit `signers`:

```typescript
const instructions = transferSol(umi, {
  source: createNoopSigner(publicKey(assetSigner)),
  destination: recipientAddress,
  amount: sol(0.5),
}).getInstructions();

await execute(umi, {
  asset,
  instructions,
  signers: [createNoopSigner(publicKey(assetSigner))],
}).sendAndConfirm(umi);
```

### With Collection

```typescript
const { asset, collection } = /* fetched asset and collection */;

await execute(umi, {
  asset,
  collection,
  instructions: transferSol(umi, {
    source: createNoopSigner(publicKey(assetSigner)),
    destination: recipientAddress,
    amount: sol(0.5),
  }),
}).sendAndConfirm(umi);
```

> **CPI limitations**: Large account creation (Merkle trees, candy machines) and native SOL wrapping may fail inside `execute()` due to Solana CPI constraints.

---

## Addressing (Core vs Token Metadata)

Core uses a **single-account model** — asset and collection addresses are the public keys of the `generateSigner()` used at creation, not PDAs derived from other accounts. This means:

- **No PDA derivation needed** to find an asset. The address returned from `create()` IS the asset address.
- To look up assets, use `fetchAssetsByOwner`, `fetchAssetsByCollection`, or DAS API queries.
- Core collections are also direct accounts (not PDAs like TM's Metadata/MasterEdition).

This differs from Token Metadata, where you derive Metadata, MasterEdition, and TokenRecord PDAs from a mint address.
