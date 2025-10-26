import { isAddress } from "ethers";

const validateContractAddress = (address) => {
  if (!isAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }
  return address;
};

export const CONTRACT_ADDRESSES = {
  lisk: {
    factoryContriboost: validateContractAddress("0x4D7D68789cbc93D33dFaFCBc87a2F6E872A5b1f8"),
    factoryGoalFund: validateContractAddress("0x5842c184b44aca1D165E990af522f2a164F2abe1"),
    usdt: validateContractAddress("0x46d96167DA9E15aaD148c8c68Aa1042466BA6EEd"),
    native: "0x0000000000000000000000000000000000000000", // ZeroAddress for Lisk ETH
  },
  celo: {
    factoryContriboost: validateContractAddress("0x4C9118aBffa2aCCa4a16d08eC1222634eb744748"),
    factoryGoalFund: validateContractAddress("0x64547A48C57583C8f595D97639543E2f1b6db4a6"),
    cusd: validateContractAddress("0xFE18f2C089f8fdCC843F183C5aBdeA7fa96C78a8"),
    native: validateContractAddress("0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9"), // Celo native token
  },
};

export const SUPPORTED_CHAINS = {
  1135: {
    chainName: "Lisk Mainnet",
    nativeCurrency: { name: "ETHER", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.api.lisk.com"],
    blockExplorerUrls: ["https://blockscout.lisk.com"],
  },
  42220: {
    chainName: "Celo Mainnet",
    nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
    rpcUrls: ["https://forno.celo.org"],
    blockExplorerUrls: ["https://celoscan.io"],
  },
};