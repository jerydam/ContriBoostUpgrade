# @divvi/referral-sdk

The Divvi referral ecosystem enables decentralized applications to implement and track referral systems on blockchain networks. This SDK simplifies the process of integrating with Divvi's referral attribution system by providing tools to tag transactions with referral metadata and report them to Divvi's tracking API.

With this SDK, dApps can:

- Attribute on-chain transactions to specific referrers
- Submit off-chain referral attributions via signed messages (for cash-in flows, etc.)

For more information about the Divvi ecosystem, visit our [documentation](https://docs.divvi.xyz/).

## Installation

```bash
yarn add @divvi/referral-sdk
```

## Overview

The SDK provides two main functions:

1. `getReferralTag` - Generates a hex string tag containing referral metadata
2. `submitReferral` - Reports referral events to the attribution tracking API

Divvi supports two referral submission methods:

### 1. On-Chain Transactions

Include the referral tag in transaction calldata, then submit the transaction hash to the API for tracking.

### 2. Off-Chain Signed Messages

Submit referrals without requiring on-chain transactions - perfect for cash-in flows, airdrops, or other off-chain activities.

## Referral Submission Methods

### Method 1: On-Chain Transaction Referrals

This is the traditional method where referral data is embedded in transaction calldata.

```typescript
import { getReferralTag, submitReferral } from '@divvi/referral-sdk'
import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

// Step 1: Create a wallet client and get the account
export const walletClient = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const [account] = await walletClient.getAddresses()

// Step 2: Execute an existing transaction within your codebase with the referral tag
const txHash = await walletClient.writeContract({
  address: contractAddress,
  account,
  abi: contractABI,
  functionName: 'yourFunction',
  args: [...yourArgs],
  dataSuffix: `0x${getReferralTag({
    user: account, // The user address making the transaction (required)
    consumer: consumerAddress, // The address of the consumer making the call
  })}`, // Using dataSuffix appends the tag (recommended)
})

// Step 3: Get the current chain ID
const chainId = await walletClient.getChainId()

// Step 4: Report the transaction to the attribution tracking API
await submitReferral({
  txHash,
  chainId,
})
```

### Method 2: Off-Chain Signed Message Referrals

This method enables referral attribution without requiring on-chain transactions, perfect for cash-in flows, airdrops, or other off-chain activities.

> **⚠️ IMPORTANT PRIVACY NOTICE**
>
> The clear text of signed messages will be recorded on the Optimism blockchain when registered in the DivviRegistry contract and will be publicly visible. **Never include private information, personal data, or sensitive details in signed messages.** Only include information that you're comfortable being publicly accessible.

```typescript
import { getReferralTag, submitReferral } from '@divvi/referral-sdk'
import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const walletClient = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const [account] = await walletClient.getAddresses()

// Step 1: Generate the referral tag
const referralTag = getReferralTag({
  user: account, // The user address consenting to the referral (required)
  consumer: consumerAddress, // The address of the consumer
})

// Step 2: Create a message containing the referral data
// RECOMMENDED: Reuse existing signed messages from your app (e.g., SIWE authentication)
// and embed the referral tag. You can use any message format - the referral tag just needs to be embedded.

// Example: Creating a new message with referral data
const message = `Divvi Referral Attribution
Referral Tag: ${referralTag}
Timestamp: ${Date.now()}`

// Alternative: Embed in existing authentication message (SIWE, etc.)
// const message = `${yourExistingAuthMessage}\nReferral Tag: ${referralTag}`

// Step 3: Sign the message
const signature = await walletClient.signMessage({
  message,
})

// Step 4: Get the current chain ID
const chainId = await walletClient.getChainId()

// Step 5: Submit the signed message referral
await submitReferral({
  message, // Can be a string or hex
  signature, // The signature from step 3
  chainId,
})
```

## Advanced Usage Examples

### Using getReferralTag with viem's sendTransaction

```typescript
import { getReferralTag, submitReferral } from '@divvi/referral-sdk'
import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const walletClient = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const [account] = await walletClient.getAddresses()

// Example transaction with referral data
const txHash = await walletClient.sendTransaction({
  account,
  to: contractAddress,
  data:
    contractData +
    getReferralTag({
      user: account, // The user address making the transaction (required)
      consumer: consumerAddress, // The address of the consumer making the call
    }), // Appending to existing data (recommended)
  value: transactionValue,
  // ... other transaction parameters
})

// Alternative: You can also include the tag anywhere in the transaction data
// const referralTag = getReferralTag({ user: account, consumer: consumerAddress })
// data: someCustomData + referralTag + moreData
```

## Signed Message Support

For off-chain signed message referrals, the Divvi tracking API supports comprehensive signature verification:

- **EOA Signatures**: Standard ECDSA signatures from externally owned accounts
- **EIP-1271 Signatures**: Smart contract wallet signatures (Safe, Account Abstraction, etc.)
- **Multiple Message Formats**:
  - UTF-8 messages with embedded referral tags
  - Hex-prefixed messages
  - Custom message formats (as long as the referral tag is embedded)

## Why the `user` Parameter Matters

The `user` parameter is crucial because Divvi cryptographically verifies that the user you specify is actually the one who consented to the transaction or signed the message. This prevents fake referrals and ensures accurate attribution.

Here's how it works:

**For on-chain transactions:**

- **Regular wallets (EOAs):** We check that `user` matches who actually sent the transaction (`tx.from`).
- **Smart accounts:** We're smarter about verification and can handle more complex scenarios like Account Abstraction wallets or Safe multisigs.

**For off-chain signed messages:**

- We verify that the `user` address actually signed the message containing the referral tag.
- Supports both EOA signatures and EIP-1271 smart contract signatures.

This means you get **accurate referral tracking** regardless of whether your users have simple wallets or more advanced smart account setups, and whether they're making on-chain transactions or off-chain commitments.

Note: If you're using a custom smart account architecture and verification fails, reach out to us - we can add support for additional patterns as needed.

**Bottom line:** Set the `user` parameter to the actual person making the transaction or signing the message, and Divvi will cryptographically ensure they're the one who really consented to it. No fake referrals, no attribution errors.

## Migration from v1 to v2

This is a **breaking change**. The SDK has been updated from v1 to v2 with the following changes:

### What Changed

- `getDataSuffix` has been replaced with `getReferralTag`
- A new `user` parameter is now **required** in `getReferralTag` to ensure proper referral attribution of the right user

### Migration Steps

1. **Update function imports**: Replace `getDataSuffix` with `getReferralTag` in your imports:

   ```typescript
   // v1 (OLD)
   import { getDataSuffix, submitReferral } from '@divvi/referral-sdk'

   // v2 (NEW)
   import { getReferralTag, submitReferral } from '@divvi/referral-sdk'
   ```

2. **Update function calls**: Replace all instances of `getDataSuffix` with `getReferralTag` and add the new required `user` parameter for proper attribution:

   ```typescript
   // v1 (OLD)
   dataSuffix: `0x${getDataSuffix({ consumer })}`

   // v2 (NEW)
   dataSuffix: `0x${getReferralTag({ user, consumer })}`
   ```

   The `user` parameter should be the address of the user making the transaction to ensure accurate referral attribution.

### Example Migration

```typescript
// v1 Implementation (OLD)
import { getDataSuffix, submitReferral } from '@divvi/referral-sdk'

const txHash = await walletClient.writeContract({
  // ... other parameters
  dataSuffix: `0x${getDataSuffix({ consumer })}`,
})

// v2 Implementation (NEW)
import { getReferralTag, submitReferral } from '@divvi/referral-sdk'

const txHash = await walletClient.writeContract({
  // ... other parameters
  dataSuffix: `0x${getReferralTag({ user, consumer })}`,
})
```

## Development

1. Clone the repository
1. Install dependencies:

   ```bash
   yarn install
   ```

1. Run tests:

   ```bash
   yarn test
   ```

## License

MIT
