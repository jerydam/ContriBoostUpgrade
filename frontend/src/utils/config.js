import { ethers } from "ethers";

const validateContractAddress = (address) => {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }
  return address;
};

export const CONTRACTS = {
  LISK_SEPOLIA: {
    ContriboostFactory: validateContractAddress("0x32C4F29AC9b7ed3fC9B202224c8419d2DCC45B06"),
    GoalFundFactory: validateContractAddress("0x68fF2794A087da4B0A5247e9693eC4290D8eaE99"),
    USDT: validateContractAddress("0x52Aee1645CA343515D12b6bd6FE24c026274e91D"),
  },
  CELO_ALFAJORES: {
    // Add addresses for Celo Alfajores if deployed
    ContriboostFactory: "0x6C07EBb84bD92D6bBBaC6Cf2d4Ac0610Fab6e39F",
    GoalFundFactory: "0x10883362beCE017EA51d643A2Dc6669bF47D2c99",
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