import { getContract, prepareContractCall, sendTransaction, readContract } from "thirdweb";
import { ContriboostFactoryAbi, GoalFundFactoryAbi } from "@/lib/contractabi";
import { isAddress } from "ethers";

const bigintReplacer = (key, value) => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
};

const CONTRACT_ADDRESSES = {
  44787: {
    factoryContriboost: "0x4C9118aBffa2aCCa4a16d08eC1222634eb744748",
    factoryGoalFund: "0x64547A48C57583C8f595D97639543E2f1b6db4a6",
    cusd: "0xFE18f2C089f8fdCC843F183C5aBdeA7fa96C78a8",
    celo: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
  },
};


export async function createContriboost({ client, chain, chainId, config, name, description, tokenAddress, account, walletType }) {
  try {
    if (chainId !== 44787) {
      throw new Error("Only Celo Alfajores (chain ID 44787) is supported");
    }

    if (walletType === "smart") {
      throw new Error("Smart Wallet is not supported on Celo Alfajores for now.");
    }

    if (!isAddress(tokenAddress)) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }

    const { paymentMethod } = config;
    // Removed Ether payment logic as it’s not used; only ERC20 tokens (CELO or cUSD) are supported
    // if (paymentMethod === 0 && tokenAddress !== ZeroAddress) {
    //   throw new Error("Token address must be zero for Ether payment");
    // }
    if (paymentMethod !== 1) {
      throw new Error("Only paymentMethod 1 (ERC20 tokens) is supported");
    }
    if (paymentMethod === 1 && ![CONTRACT_ADDRESSES[chainId].celo, CONTRACT_ADDRESSES[chainId].cusd].includes(tokenAddress)) {
      throw new Error("Token address must be either the CELO or cUSD ERC20 address for paymentMethod 1");
    }

    if (!name || typeof name !== "string" || name.length < 3) {
      throw new Error("Name must be a string with at least 3 characters");
    }

    if (!description || typeof description !== "string" || description.length < 10) {
      throw new Error("Description must be a string with at least 10 characters");
    }

    const { dayRange, expectedNumber, contributionAmount, hostFeePercentage, platformFeePercentage, maxMissedDeposits, startTimestamp } = config;
    if (!Number.isInteger(dayRange) || dayRange < 1) {
      throw new Error("dayRange must be an integer >= 1");
    }
    if (!Number.isInteger(expectedNumber) || expectedNumber < 2) {
      throw new Error("expectedNumber must be an integer >= 2");
    }
    if (typeof contributionAmount !== "bigint" || contributionAmount <= 0n) {
      throw new Error("contributionAmount must be a positive bigint");
    }
    if (!Number.isInteger(hostFeePercentage) || hostFeePercentage < 0 || hostFeePercentage > 500) {
      throw new Error("hostFeePercentage must be between 0 and 500 (0-5%)");
    }
    if (!Number.isInteger(platformFeePercentage) || platformFeePercentage < 0) {
      throw new Error("platformFeePercentage must be non-negative");
    }
    if (!Number.isInteger(maxMissedDeposits) || maxMissedDeposits < 0) {
      throw new Error("maxMissedDeposits must be non-negative");
    }
    if (!Number.isInteger(startTimestamp) || startTimestamp < Math.floor(Date.now() / 1000)) {
      throw new Error("startTimestamp must be in the future");
    }

    console.log("createContriboost inputs:", { chainId, config, name, description, tokenAddress, walletType });

    const contract = getContract({
      client,
      chain,
      address: CONTRACT_ADDRESSES[chainId].factoryContriboost,
      abi: ContriboostFactoryAbi,
    });

    const transaction = await prepareContractCall({
      contract,
      method: "createContriboost",
      params: [config, name, description, tokenAddress],
    });

    let receipt;
    let transactionHash;
    try {
      receipt = await sendTransaction({
        transaction,
        account,
      });
      transactionHash = receipt.transactionHash;
    } catch (sendError) {
      console.error("Error sending transaction:", sendError.message, sendError);
      if (walletType === "smart" && sendError.message.includes("eth_sendUserOperation")) {
        console.warn("UserOp failed, attempting to recover transaction receipt...");
        if (sendError.transactionHash) {
          transactionHash = sendError.transactionHash;
          receipt = await client.getTransactionReceipt({ hash: transactionHash });
          console.log("Recovered receipt:", JSON.stringify(receipt, bigintReplacer, 2));
        } else {
          throw new Error(`UserOp failed: ${sendError.message}`);
        }
      } else {
        throw sendError;
      }
    }

    console.log("createContriboost receipt:", {
      transactionHash,
      walletType,
      logs: receipt.logs || "No logs available",
      events: receipt.events || "No events available",
      rawReceipt: JSON.stringify(receipt, bigintReplacer, 2),
    });

    let newContractAddress;
    if (receipt.logs) {
      const event = receipt.logs.find(log => {
        try {
          const parsedLog = contract.interface.parseLog(log);
          return parsedLog.name === "ContriboostCreated";
        } catch {
          return false;
        }
      });

      if (event) {
        const parsedLog = contract.interface.parseLog(event);
        newContractAddress = parsedLog.args.contriboost;
      }
    }

    if (!newContractAddress) {
      console.warn("Could not find ContriboostCreated event in logs, attempting to fetch from contract");
      try {
        newContractAddress = await readContract({
          contract,
          method: "getContriboostByIndex",
          params: [(await readContract({ contract, method: "getContriboostCount" })) - 1n],
        });
      } catch (fetchError) {
        console.error("Failed to fetch ContriboostCreated event:", fetchError);
        throw new Error(`Failed to fetch ContriboostCreated event: ${fetchError.message}`);
      }
    }

    return { receipt, newContractAddress };
  } catch (error) {
    console.error("Error in createContriboost:", error);
    throw new Error(`Error creating Contriboost: ${error.message}`);
  }
}

export async function createGoalFund({
  client,
  chain,
  chainId,
  name,
  description,
  targetAmount,
  deadline,
  beneficiary,
  paymentMethod,
  tokenAddress,
  fundType,
  account,
  walletType,
}) {
  try {
    // Validate chain ID
    if (chainId !== 44787) {
      throw new Error("Only Celo Alfajores (chain ID 44787) is supported");
    }

    // Validate addresses
    if (!isAddress(beneficiary)) {
      throw new Error(`Invalid beneficiary address: ${beneficiary}`);
    }
    if (!isAddress(tokenAddress)) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }

    // Validate payment method and token address
    if (paymentMethod !== 1) {
      throw new Error("Only paymentMethod 1 (ERC20 tokens) is supported");
    }
    if (
      paymentMethod === 1 &&
      ![CONTRACT_ADDRESSES[chainId].celo, CONTRACT_ADDRESSES[chainId].cusd].includes(tokenAddress)
    ) {
      throw new Error("Token address must be either the CELO or cUSD ERC20 address for paymentMethod 1");
    }

    // Validate input parameters
    if (!name || typeof name !== "string" || name.length < 3) {
      throw new Error("Name must be a string with at least 3 characters");
    }
    if (!description || typeof description !== "string" || description.length < 10) {
      throw new Error("Description must be a string with at least 10 characters");
    }
    if (typeof targetAmount !== "bigint" || targetAmount <= 0n) {
      throw new Error("targetAmount must be a positive bigint");
    }
    if (!Number.isInteger(deadline) || deadline < Math.floor(Date.now() / 1000)) {
      throw new Error("deadline must be in the future");
    }
    if (![0, 1].includes(Number(fundType))) {
      throw new Error("fundType must be 0 (group) or 1 (personal)");
    }

    console.log("createGoalFund inputs:", {
      chainId,
      name,
      description,
      targetAmount: targetAmount.toString(),
      deadline,
      beneficiary,
      paymentMethod,
      tokenAddress,
      fundType,
      walletType,
    });

    // Initialize contract
    const contract = getContract({
      client,
      chain,
      address: CONTRACT_ADDRESSES[chainId].factoryGoalFund,
      abi: GoalFundFactoryAbi,
    });

    // Prepare the contract call
    const transaction = await prepareContractCall({
      contract,
      method: "createGoalFund",
      params: [name, description, targetAmount, deadline, beneficiary, paymentMethod, tokenAddress, Number(fundType)],
    });

    let receipt;
    let transactionHash;
    try {
      // Send transaction (works for both standard and smart wallets)
      receipt = await sendTransaction({
        transaction,
        account,
      });
      transactionHash = receipt.transactionHash;
    } catch (sendError) {
      console.error("Error sending transaction:", sendError.message, sendError);
      if (walletType === "smart" && sendError.message.includes("eth_sendUserOperation")) {
        console.warn("UserOp failed, attempting to recover transaction receipt...");
        if (sendError.transactionHash) {
          transactionHash = sendError.transactionHash;
          receipt = await client.getTransactionReceipt({ hash: transactionHash });
          console.log("Recovered receipt:", JSON.stringify(receipt, bigintReplacer, 2));
        } else {
          throw new Error(`UserOp failed: ${sendError.message}`);
        }
      } else {
        throw new Error(`Error sending transaction: ${sendError.message}`);
      }
    }

    console.log("createGoalFund receipt:", {
      transactionHash,
      walletType,
      logs: receipt.logs || "No logs available",
      events: receipt.events || "No events available",
      rawReceipt: JSON.stringify(receipt, bigintReplacer, 2),
    });

    // Extract new contract address from logs
    let newContractAddress;
    if (receipt.logs) {
      const event = receipt
      console.logs.find(log => {
        try {
          const parsedLog = contract.interface.parseLog(log);
          return parsedLog.name === "GoalFundCreated";
        } catch {
          return false;
        }
      });

      if (event) {
        const parsedLog = contract.interface.parseLog(event);
        newContractAddress = parsedLog.args.goalFundAddress;
      }
    }

    // Fallback to fetching from contract if event not found
    if (!newContractAddress) {
      console.warn("Could not find GoalFundCreated event in logs, attempting to fetch from contract");
      try {
        const goalFundCount = await readContract({
          contract,
          method: "getGoalFunds",
        });
        newContractAddress = await readContract({
          contract,
          method: "allGoalFunds",
          params: [goalFundCount.length - 1],
        });
      } catch (fetchError) {
        console.error("Failed to fetch GoalFundCreated event:", fetchError);
        throw new Error(`Failed to fetch GoalFundCreated event: ${fetchError.message}`);
      }
    }

    return { receipt, newContractAddress };
  } catch (error) {
    console.error("Error in createGoalFund:", error);
    throw new Error(`Error creating GoalFund: ${error.message}`);
  }
}