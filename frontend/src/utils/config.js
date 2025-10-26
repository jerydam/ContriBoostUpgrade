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
    // Add addresses for Celo if deployed
    ContriboostFactory: "0x6580B6E641061D71c809f8EDa8a522f9EB88F180",
    GoalFundFactory: "0x075fdc4CC845BB7D0049EDEe798b6B208B6ECDaF",
    cUSD: validateContractAddress("0x765DE816845861e75A25fCA122bb6898B8B1282a"),
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