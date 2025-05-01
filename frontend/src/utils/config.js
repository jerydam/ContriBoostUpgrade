import { ethers } from "ethers";

const validateContractAddress = (address) => {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }
  return address;
};

export const CONTRACTS = {
  LISK_SEPOLIA: {
    ContriboostFactory: validateContractAddress("0xaE83198F4c622a5dccdda1B494fF811f5B6F3631"),
    GoalFundFactory: validateContractAddress("0x791F269E311aE13e490ffEf7DFd68f27f7B21E41"),
    USDT: validateContractAddress("0x2728DD8B45B788e26d12B13Db5A244e5403e7eda"),
  },
  CELO_ALFAJORES: {
    // Add addresses for Celo Alfajores if deployed
    ContriboostFactory: "0x2cF3869e0522ebEa4161ff601d5711A7Af13ebA3",
    GoalFundFactory: "0x2F07fc486b87B5512b3e33E369E0151de52BE1dA",
    USDT: "",
  },
};

export const SUPPORTED_CHAINS = {
  4202: {
    chainName: "Lisk Sepolia Testnet",
    nativeCurrency: { name: "Lisk Sepolia ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.sepolia-api.lisk.com"],
    blockExplorerUrls: ["https://sepolia-blockscout.lisk.com"],
  },
  44787: {
    chainName: "Celo Alfajores Testnet",
    nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
    rpcUrls: ["https://alfajores-forno.celo-testnet.org"],
    blockExplorerUrls: ["https://alfajores-blockscout.celo-testnet.org"],
  },
};