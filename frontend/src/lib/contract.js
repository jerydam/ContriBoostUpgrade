import { getContract, prepareContractCall, sendTransaction, readContract, waitForReceipt } from "thirdweb";
import { ContriboostFactoryAbi, GoalFundFactoryAbi } from "@/lib/contractabi";
import { isAddress, ZeroAddress } from "ethers";

// Custom replacer function to handle BigInt serialization
const bigintReplacer = (key, value) => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
};

const CONTRACT_ADDRESSES = {
  4202: {
    factoryContriboost: "0x4D7D68789cbc93D33dFaFCBc87a2F6E872A5b1f8",
    factoryGoalFund: "0x5842c184b44aca1D165E990af522f2a164F2abe1",
    usdt: "0x46d96167DA9E15aaD148c8c68Aa1042466BA6EEd",
    native: ZeroAddress,
  },
};

export async function createContriboost({ client, chain, chainId, config, name, description, tokenAddress, account, walletType }) {
  try {
    if (!CONTRACT_ADDRESSES[chainId]) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    if (!isAddress(tokenAddress)) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }

    const { paymentMethod, dayRange, expectedNumber, contributionAmount, hostFeePercentage, platformFeePercentage, maxMissedDeposits, startTimestamp } = config;
    if (paymentMethod === 0 && tokenAddress !== ZeroAddress) {
      throw new Error("Token address must be ZeroAddress for native payment (paymentMethod: 0)");
    }
    if (paymentMethod === 1 && tokenAddress === ZeroAddress) {
      throw new Error("Token address must be a valid ERC-20 address for token payment (paymentMethod: 1)");
    }
    if (!name || typeof name !== "string" || name.length < 3) {
      throw new Error("Name must be a string with at least 3 characters");
    }
    if (!description || typeof description !== "string" || description.length < 10) {
      throw new Error("Description must be a string with at least 10 characters");
    }
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
    if (![0, 1].includes(paymentMethod)) {
      throw new Error("paymentMethod must be 0 (native) or 1 (token)");
    }

    console.log("createContriboost inputs:", {
      chainId,
      config: JSON.stringify(config, bigintReplacer, 2),
      name,
      description,
      tokenAddress,
      walletType,
      account,
    });

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
      gasless: walletType === "smart" ? { enable: true } : undefined, // Explicitly enable gasless for smart wallets
    });

    let receipt;
    let transactionHash;
    try {
      console.log("Sending transaction with account:", account.address);
      const result = await sendTransaction({
        transaction,
        account,
      });
      transactionHash = result.transactionHash;
      console.log("Transaction sent, waiting for receipt:", transactionHash);
      
      // Wait for the transaction to be mined
      receipt = await waitForReceipt({
        client,
        chain,
        transactionHash,
      });
    } catch (sendError) {
      console.error("Error sending transaction:", sendError.message, sendError.stack);
      if (walletType === "smart" && sendError.message.includes("eth_sendUserOperation")) {
        console.warn("UserOp failed, attempting to recover transaction receipt...");
        if (sendError.transactionHash) {
          transactionHash = sendError.transactionHash;
          try {
            receipt = await waitForReceipt({
              client,
              chain,
              transactionHash,
            });
            console.log("Recovered receipt:", JSON.stringify(receipt, bigintReplacer, 2));
          } catch (recoveryError) {
            throw new Error(`Failed to recover UserOp receipt: ${recoveryError.message}`);
          }
        } else {
          throw new Error(`UserOp failed: ${sendError.message}. Check Biconomy paymaster funding and configuration.`);
        }
      } else if (sendError.message.includes("paymaster")) {
        throw new Error(`Paymaster error: ${sendError.message}. Ensure Biconomy paymaster is funded and policies are correctly set.`);
      } else {
        throw new Error(`Transaction failed: ${sendError.message}`);
      }
    }

    console.log("createContriboost receipt:", {
      transactionHash,
      walletType,
      status: receipt.status,
      logs: receipt.logs || "No logs available",
      rawReceipt: JSON.stringify(receipt, bigintReplacer, 2),
    });

    // Check if transaction was successful
    if (receipt.status !== "success") {
      const error = new Error("Transaction reverted. Check contract parameters or paymaster settings.");
      error.receipt = receipt;
      error.transactionHash = transactionHash;
      throw error;
    }

    // Parse ContriboostCreated event
    let event;
    try {
      if (receipt.logs && Array.isArray(receipt.logs)) {
        event = receipt.logs.find((log) => log.topics[0] === contract.interface.getEventTopic("ContriboostCreated"));
        if (event) {
          event = contract.interface.parseLog(event);
        }
      }
    } catch (parseError) {
      console.warn("Failed to parse logs directly:", parseError.message);
    }

    if (!event) {
      console.warn("ContriboostCreated event not found in receipt, fetching from contract...");
      try {
        const events = await readContract({
          contract,
          method: "getPastEvents",
          params: ["ContriboostCreated", { fromBlock: receipt.blockNumber - 10, toBlock: receipt.blockNumber }],
        });
        event = events.find((e) => e.transactionHash === transactionHash);
        if (!event) {
          console.error("ContriboostCreated event not found in contract events:", JSON.stringify(events, bigintReplacer, 2));
          const error = new Error("Could not find ContriboostCreated event in transaction receipt or contract events");
          error.receipt = receipt;
          error.transactionHash = transactionHash;
          throw error;
        }
      } catch (fetchError) {
        console.error("Failed to fetch events from contract:", fetchError.message);
        const error = new Error(`Failed to fetch ContriboostCreated event: ${fetchError.message}`);
        error.receipt = receipt;
        error.transactionHash = transactionHash;
        throw error;
      }
    }

    if (!event.args || !event.args.contriboostAddress) {
      console.error("ContriboostCreated event missing args:", JSON.stringify(event, bigintReplacer, 2));
      const error = new Error("ContriboostCreated event missing contriboostAddress");
      error.receipt = receipt;
      error.transactionHash = transactionHash;
      throw error;
    }

    const newContractAddress = event.args.contriboostAddress;
    if (!isAddress(newContractAddress)) {
      const error = new Error("Invalid contract address received from ContriboostCreated event");
      error.receipt = receipt;
      error.transactionHash = transactionHash;
      throw error;
    }

    console.log("Contriboost created successfully:", { newContractAddress, transactionHash });
    return { receipt, newContractAddress, transactionHash };
  } catch (error) {
    console.error("Error in createContriboost:", error.message, error.stack);
    const wrappedError = new Error(`Failed to create Contriboost: ${error.message}`);
    wrappedError.receipt = error.receipt || null;
    wrappedError.transactionHash = error.transactionHash || null;
    throw wrappedError;
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
    if (!CONTRACT_ADDRESSES[chainId]) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    if (!isAddress(beneficiary)) {
      throw new Error(`Invalid beneficiary address: ${beneficiary}`);
    }

    if (!isAddress(tokenAddress)) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }

    if (paymentMethod === 0 && tokenAddress !== ZeroAddress) {
      throw new Error("Token address must be ZeroAddress for native payment (paymentMethod: 0)");
    }
    if (paymentMethod === 1 && tokenAddress === ZeroAddress) {
      throw new Error("Token address must be a valid ERC-20 address for token payment (paymentMethod: 1)");
    }

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

    if (![0, 1].includes(paymentMethod)) {
      throw new Error("paymentMethod must be 0 (native) or 1 (token)");
    }

    if (![0, 1].includes(fundType)) {
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
      account,
    });

    const contract = getContract({
      client,
      chain,
      address: CONTRACT_ADDRESSES[chainId].factoryGoalFund,
      abi: GoalFundFactoryAbi,
    });

    const transaction = await prepareContractCall({
      contract,
      method: "createGoalFund",
      params: [
        name,
        description,
        targetAmount,
        deadline,
        beneficiary,
        paymentMethod,
        tokenAddress,
        fundType,
      ],
      gasless: walletType === "smart" ? { enable: true } : undefined, // Explicitly enable gasless for smart wallets
    });

    let receipt;
    let transactionHash;
    try {
      console.log("Sending transaction with account:", account.address);
      const result = await sendTransaction({
        transaction,
        account,
      });
      transactionHash = result.transactionHash;
      console.log("Transaction sent, waiting for receipt:", transactionHash);
      
      // Wait for the transaction to be mined
      receipt = await waitForReceipt({
        client,
        chain,
        transactionHash,
      });
    } catch (sendError) {
      console.error("Error sending transaction:", sendError.message, sendError.stack);
      if (walletType === "smart" && sendError.message.includes("eth_sendUserOperation")) {
        console.warn("UserOp failed, attempting to recover transaction receipt...");
        if (sendError.transactionHash) {
          transactionHash = sendError.transactionHash;
          try {
            receipt = await waitForReceipt({
              client,
              chain,
              transactionHash,
            });
            console.log("Recovered receipt:", JSON.stringify(receipt, bigintReplacer, 2));
          } catch (recoveryError) {
            throw new Error(`Failed to recover UserOp receipt: ${recoveryError.message}`);
          }
        } else {
          throw new Error(`UserOp failed: ${sendError.message}. Check Biconomy paymaster funding and configuration.`);
        }
      } else if (sendError.message.includes("paymaster")) {
        throw new Error(`Paymaster error: ${sendError.message}. Ensure Biconomy paymaster is funded and policies are correctly set.`);
      } else {
        throw new Error(`Transaction failed: ${sendError.message}`);
      }
    }

    console.log("createGoalFund receipt:", {
      transactionHash,
      walletType,
      status: receipt.status,
      logs: receipt.logs || "No logs available",
      rawReceipt: JSON.stringify(receipt, bigintReplacer, 2),
    });

    // Check if transaction was successful
    if (receipt.status !== "success") {
      const error = new Error("Transaction reverted. Check contract parameters or paymaster settings.");
      error.receipt = receipt;
      error.transactionHash = transactionHash;
      throw error;
    }

    // Parse GoalFundCreated event
    let event;
    try {
      if (receipt.logs && Array.isArray(receipt.logs)) {
        event = receipt.logs.find((log) => log.topics[0] === contract.interface.getEventTopic("GoalFundCreated"));
        if (event) {
          event = contract.interface.parseLog(event);
        }
      }
    } catch (parseError) {
      console.warn("Failed to parse logs directly:", parseError.message);
    }

    if (!event) {
      console.warn("GoalFundCreated event not found in receipt, fetching from contract...");
      try {
        const events = await readContract({
          contract,
          method: "getPastEvents",
          params: ["GoalFundCreated", { fromBlock: receipt.blockNumber - 10, toBlock: receipt.blockNumber }],
        });
        event = events.find((e) => e.transactionHash === transactionHash);
        if (!event) {
          console.error("GoalFundCreated event not found in contract events:", JSON.stringify(events, bigintReplacer, 2));
          const error = new Error("Could not find GoalFundCreated event in transaction receipt or contract events");
          error.receipt = receipt;
          error.transactionHash = transactionHash;
          throw error;
        }
      } catch (fetchError) {
        console.error("Failed to fetch events from contract:", fetchError.message);
        const error = new Error(`Failed to fetch GoalFundCreated event: ${fetchError.message}`);
        error.receipt = receipt;
        error.transactionHash = transactionHash;
        throw error;
      }
    }

    if (!event.args || !event.args.goalFundAddress) {
      console.error("GoalFundCreated event missing args:", JSON.stringify(event, bigintReplacer, 2));
      const error = new Error("GoalFundCreated event missing goalFundAddress");
      error.receipt = receipt;
      error.transactionHash = transactionHash;
      throw error;
    }

    const newContractAddress = event.args.goalFundAddress;
    if (!isAddress(newContractAddress)) {
      const error = new Error("Invalid contract address received from GoalFundCreated event");
      error.receipt = receipt;
      error.transactionHash = transactionHash;
      throw error;
    }

    console.log("GoalFund created successfully:", { newContractAddress, transactionHash });
    return { receipt, newContractAddress, transactionHash };
  } catch (error) {
    console.error("Error in createGoalFund:", error.message, error.stack);
    const wrappedError = new Error(`Failed to create GoalFund: ${error.message}`);
    wrappedError.receipt = error.receipt || null;
    wrappedError.transactionHash = error.transactionHash || null;
    throw wrappedError;
  }
}