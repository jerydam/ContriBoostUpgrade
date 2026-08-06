// Single source of truth for the network and deployed contract addresses.
// Deployment: smartcontract/deployments/968.json

export const CHAIN_ID = 677;

export const RPC_URL = "https://rpc.botchain.ai";
export const EXPLORER_URL = "https://scan.botchain.ai";

/** Payload for wallet_addEthereumChain / wallet_switchEthereumChain. */
export const CHAIN_CONFIG = {
  chainName: "BotChain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [EXPLORER_URL],
};

export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

// --- Deployed contracts (chain 968) ---------------------------------------

export const NESTORA_FACTORY_ADDRESS = "0x1b021caa0d4c981f4695C2cD7c5c45e8A76c34cC";
export const SAVINGS_FACTORY_ADDRESS = "0xD15De4c3ec402c2Eb412d9173153f4451228434c";
export const BILL_PAYMENT_ADDRESS = "0xdA4B884765483CfA5a48d121cBd6EC774c92Bd74";

// --- Payment tokens --------------------------------------------------------

/** BotChain's native coin is used as `address(0)` by Nestora/Savings. */
export const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";
export const NATIVE_SYMBOL = CHAIN_CONFIG.nativeCurrency.symbol;

/**
 * ERC20s accepted alongside the native coin. BotChain has none wired up yet;
 * add `{ address, symbol, decimals }` entries here and they flow through the
 * create forms, pool lists and balance formatting automatically.
 */
export const ERC20_TOKENS = [];

export const isNativeToken = (address) =>
  !address || address.toLowerCase() === NATIVE_TOKEN_ADDRESS;

/** Human-readable symbol for a token address (native or a known ERC20). */
export function getTokenSymbol(address) {
  if (isNativeToken(address)) return NATIVE_SYMBOL;
  const token = ERC20_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
  return token ? token.symbol : "Unknown";
}

/** Nestora.PaymentMethod / Savings.PaymentMethod enum. */
export const PAYMENT_METHOD = { Ether: 0, ERC20: 1 };

export const paymentMethodFor = (tokenAddress) =>
  isNativeToken(tokenAddress) ? PAYMENT_METHOD.Ether : PAYMENT_METHOD.ERC20;

export const explorerAddressUrl = (address) => `${EXPLORER_URL}/address/${address}`;
export const explorerTxUrl = (hash) => `${EXPLORER_URL}/tx/${hash}`;
