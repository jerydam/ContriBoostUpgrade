import { ethers } from "ethers";

const validateContractAddress = (address) => {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }
  return address;
};

export const CONTRACTS = {
  LISK_SEPOLIA: {
    ContriboostFactory: validateContractAddress("0xF122b07B2730c6056114a5507FA1A776808Bf0A4"),
    GoalFundFactory: validateContractAddress("0x3D6D20896b945E947b962a8c043E09c522504079"),
    USDT: validateContractAddress("0x46d96167DA9E15aaD148c8c68Aa1042466BA6EEd"),
  },
  CELO_ALFAJORES: {
    // Add addresses for Celo Alfajores if deployed
    ContriboostFactory: "0x8DE33AbcC5eB868520E1ceEee5137754cb3A558c",
    GoalFundFactory: "0xDB4421c212D78bfCB4380276428f70e50881ABad",
    cUSD: validateContractAddress("0xFE18f2C089f8fdCC843F183C5aBdeA7fa96C78a8"),
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