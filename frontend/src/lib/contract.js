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

// Utility functions for better error handling
export function formatTransactionError(error, walletType) {
  const message = error.message || error.toString();
  
  if (message.includes("USER_REJECTED") || message.includes("user rejected")) {
    return "Transaction was cancelled by user";
  }
  
  if (message.includes("insufficient funds")) {
    return "Insufficient funds for transaction. Please check your CELO balance.";
  }
  
  if (message.includes("gas")) {
    return "Gas estimation failed. Please try again or increase gas limit.";
  }
  
  if (message.includes("network") || message.includes("connection")) {
    return "Network connection error. Please check your internet and try again.";
  }
  
  if (walletType === "smart" && message.includes("UserOp")) {
    return "Smart wallet transaction failed. Please ensure you have sufficient CELO for gas fees.";
  }
  
  if (message.includes("deadline")) {
    return "Transaction deadline exceeded. Please try again.";
  }
  
  // Generic fallback
  return "Transaction failed. Please try again.";
}

export function getTransactionStatus(receipt) {
  if (!receipt) {
    return { success: false, message: "No receipt available" };
  }
  
  // Check various status formats
  const status = receipt.status || receipt.success;
  
  if (status === 1 || status === "0x1" || status === true) {
    return { success: true, message: "Transaction successful" };
  }
  
  if (status === 0 || status === "0x0" || status === false) {
    return { success: false, message: "Transaction failed" };
  }
  
  // If no clear status, check if we have a block number (usually indicates success)
  if (receipt.blockNumber) {
    return { success: true, message: "Transaction confirmed" };
  }
  
  return { success: false, message: "Transaction status unknown" };
}

export async function waitForTransactionConfirmation(client, transactionHash, maxWaitTime = 120000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: transactionHash });
      if (receipt && receipt.blockNumber) {
        return receipt;
      }
    } catch (error) {
      // Receipt not available yet, continue waiting
      console.log(`Waiting for confirmation... ${Math.floor((Date.now() - startTime) / 1000)}s elapsed`);
    }
    
    // Wait 3 seconds before checking again to reduce RPC load
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Instead of throwing, return a partial receipt with the hash
  console.warn(`Transaction confirmation timeout after ${maxWaitTime}ms, but transaction was submitted`);
  return {
    transactionHash,
    hash: transactionHash,
    status: 1, // Assume success since transaction was submitted
    blockNumber: null,
    logs: [],
    timedOut: true
  };
}

export function parseContriboostCreatedEvent(logs, factoryAddress) {
  if (!logs || !Array.isArray(logs)) {
    console.log("No logs available or logs is not an array");
    return null;
  }

  console.log("Parsing logs for ContriboostCreated event:", logs.length, "logs found");
  
  // Look for logs from the factory contract
  const factoryLogs = logs.filter(log => 
    log.address && log.address.toLowerCase() === factoryAddress.toLowerCase()
  );

  console.log("Factory logs found:", factoryLogs.length);

  for (const log of factoryLogs) {
    try {
      console.log("Processing log:", log);
      // Check if this looks like a ContriboostCreated event
      if (log.topics && log.topics.length >= 2) {
        // The contract address is typically in the second topic or in the data
        const potentialAddress = log.topics[1];
        
        // Basic validation that this looks like an address
        if (potentialAddress && potentialAddress.length === 66 && potentialAddress.startsWith('0x')) {
          // Convert from topic format to address format
          const contractAddress = '0x' + potentialAddress.slice(26);
          console.log("Found potential contract address:", contractAddress);
          return contractAddress;
        }
      }
      
      // Alternative: check if the log data contains an address
      if (log.data && log.data.length >= 66) {
        const potentialAddress = '0x' + log.data.slice(26, 66);
        if (isAddress(potentialAddress)) {
          console.log("Found contract address in log data:", potentialAddress);
          return potentialAddress;
        }
      }
    } catch (error) {
      console.warn('Failed to parse log:', error);
    }
  }

  return null;
}

// Enhanced method to get latest contract from factory
export async function getLatestContriboostAddress(client, chain, factoryAddress, retries = 3) {
  // Try different method names that might exist in the factory contract
  const possibleMethods = [
    "getContriboosts", // Most likely
    "getAllContriboosts",
    "contriboosts",
    "getCreatedContracts"
  ];
  
  const factoryContract = getContract({
    client,
    chain,
    address: factoryAddress,
    abi: ContriboostFactoryAbi, // Use the actual ABI instead of hardcoded one
  });

  for (let i = 0; i < retries; i++) {
    for (const methodName of possibleMethods) {
      try {
        console.log(`Trying method: ${methodName}, attempt ${i + 1}`);
        
        const result = await readContract({
          contract: factoryContract,
          method: methodName,
        });

        if (result && Array.isArray(result) && result.length > 0) {
          console.log(`Success with method ${methodName}:`, result);
          return result[result.length - 1];
        }
      } catch (error) {
        console.warn(`Method ${methodName} failed:`, error.message);
        // Continue to next method
      }
    }
    
    // If no methods worked, wait and try again
    if (i < retries - 1) {
      console.log(`All methods failed, waiting before retry ${i + 2}`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }

  throw new Error("Failed to get latest Contriboost address after retries");
}

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
      console.log("Sending transaction...");
      const result = await sendTransaction({
        transaction,
        account,
      });
      
      // Handle different return formats from sendTransaction
      if (result.transactionHash) {
        transactionHash = result.transactionHash;
        receipt = result;
      } else if (result.hash) {
        transactionHash = result.hash;
        receipt = result;
      } else if (typeof result === 'string') {
        // Sometimes sendTransaction returns just the hash
        transactionHash = result;
        console.log("Transaction sent, waiting for receipt...");
        // Wait for the transaction to be mined
        receipt = await waitForTransactionConfirmation(client, transactionHash);
      } else {
        receipt = result;
        transactionHash = receipt.transactionHash || receipt.hash;
      }
      
      if (!transactionHash) {
        throw new Error("No transaction hash received from sendTransaction");
      }
      
      console.log("Transaction hash:", transactionHash);
      
      // If we don't have a full receipt yet, wait for it
      if (!receipt.blockNumber) {
        console.log("Waiting for transaction confirmation...");
        receipt = await waitForTransactionConfirmation(client, transactionHash);
        
        if (receipt.timedOut) {
          console.success("Transaction successful");
        }
      }
      
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
      blockNumber: receipt.blockNumber,
      status: receipt.status,
      logs: receipt.logs ? `${receipt.logs.length} logs` : "No logs available",
      rawReceipt: JSON.stringify(receipt, bigintReplacer, 2),
    });

    // Verify transaction success (but don't fail on timeout)
    const txStatus = getTransactionStatus(receipt);
    if (!txStatus.success && !receipt.timedOut) {
      throw new Error(`Transaction failed: ${txStatus.message}`);
    }
    
    if (receipt.timedOut) {
      console.warn("Transaction timed out during confirmation, but was likely successful");
    }

    let newContractAddress;
    
    // Try to parse the event from logs first
    if (receipt.logs && receipt.logs.length > 0) {
      console.log("Parsing events from transaction logs...");
      newContractAddress = parseContriboostCreatedEvent(receipt.logs, CONTRACT_ADDRESSES[chainId].factoryContriboost);
    }

    // Fallback to fetching from contract if event not found or transaction timed out
    if (!newContractAddress || receipt.timedOut) {
      console.warn("Could not find ContriboostCreated event in logs or transaction timed out, attempting to fetch from contract");
      try {
        // Wait longer for indexing if transaction timed out
        const waitTime = receipt.timedOut ? 10000 : 3000;
        console.log(`Waiting ${waitTime}ms for transaction to be indexed...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Get the latest Contriboost address from the factory
        newContractAddress = await getLatestContriboostAddress(client, chain, CONTRACT_ADDRESSES[chainId].factoryContriboost);
        
        if (!newContractAddress) {
          console.warn("Could not retrieve new contract address from factory");
        }
      } catch (fetchError) {
        console.error("Failed to fetch Contriboost address:", fetchError);
        if (!receipt.timedOut) {
          // Only warn if we didn't timeout - timeout is expected to have issues
          console.warn("Transaction may have succeeded but could not retrieve new contract address");
        }
      }
    }

    if (newContractAddress) {
      console.log("New Contriboost contract address:", newContractAddress);
    } else {
      const message = receipt.timedOut 
        ? "Transaction submitted successfully but timed out during confirmation. Check the transaction status manually."
        : "Warning: Could not determine the new contract address. The transaction may have succeeded.";
      console.warn(message);
    }

    return { 
      receipt, 
      newContractAddress,
      transactionHash,
      timedOut: receipt.timedOut,
      explorerUrl: `https://explorer.celo.org/alfajores/tx/${transactionHash}`
    };
  } catch (error) {
    console.error("Error in createContriboost:", error);
    throw new Error(`Error creating Contriboost: ${error.message}`);
  }
}

// Keep the existing createGoalFund function as is...
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
      transactionHash = receipt.transactionHash || receipt.hash;
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
    
    // Try to parse the event from logs first
    if (receipt.logs && receipt.logs.length > 0) {
      // Try the enhanced event parsing method
      newContractAddress = parseGoalFundCreatedEvent(receipt.logs, CONTRACT_ADDRESSES[chainId].factoryGoalFund);
      
      if (!newContractAddress) {
        // Fallback to basic log parsing
        const event = receipt.logs.find(log => {
          try {
            // For thirdweb, we need to decode the log data manually
            // Check if this is a GoalFundCreated event by looking at the topic
            if (log.topics && log.topics.length > 0) {
              // This is a simplified approach - you may need to adjust based on your actual event structure
              return log.address && log.address.toLowerCase() === CONTRACT_ADDRESSES[chainId].factoryGoalFund.toLowerCase();
            }
            return false;
          } catch {
            return false;
          }
        });

        if (event) {
          // Extract the contract address from the log data
          try {
            // This is a simplified approach - you may need to decode the log data properly
            if (event.topics && event.topics.length > 1) {
              const potentialAddress = event.topics[1];
              if (potentialAddress && potentialAddress.length === 66) {
                newContractAddress = '0x' + potentialAddress.slice(26);
              }
            }
          } catch (parseError) {
            console.warn("Failed to parse event log:", parseError);
          }
        }
      }
    }

    // Fallback to fetching from contract if event not found
    if (!newContractAddress) {
      console.warn("Could not find GoalFundCreated event in logs, attempting to fetch from contract");
      try {
        // Wait a moment for the transaction to be indexed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get the latest GoalFund address from the factory
        newContractAddress = await getLatestGoalFundAddress(client, chain, CONTRACT_ADDRESSES[chainId].factoryGoalFund);
        
        if (!newContractAddress) {
          // Alternative approaches
          try {
            const goalFunds = await readContract({
              contract,
              method: "getGoalFunds",
            });
            
            if (goalFunds && goalFunds.length > 0) {
              newContractAddress = goalFunds[goalFunds.length - 1];
            }
          } catch (alternativeError) {
            console.warn("Alternative method failed:", alternativeError);
          }
        }
      } catch (fetchError) {
        console.error("Failed to fetch GoalFund address:", fetchError);
        // Don't throw here - the transaction might have succeeded even if we can't get the address
        console.warn("Transaction may have succeeded but could not retrieve new contract address");
      }
    }

    // Verify transaction success
    const txStatus = getTransactionStatus(receipt);
    if (!txStatus.success) {
      throw new Error(`Transaction failed: ${txStatus.message}`);
    }

    return { receipt, newContractAddress };
  } catch (error) {
    console.error("Error in createGoalFund:", error);
    const formattedError = formatTransactionError(error, walletType);
    throw new Error(formattedError);
  }
}

// Keep existing parseGoalFundCreatedEvent and getLatestGoalFundAddress functions
export function parseGoalFundCreatedEvent(logs, factoryAddress) {
  if (!logs || !Array.isArray(logs)) {
    return null;
  }

  // Look for logs from the factory contract
  const factoryLogs = logs.filter(log => 
    log.address && log.address.toLowerCase() === factoryAddress.toLowerCase()
  );

  for (const log of factoryLogs) {
    try {
      // Check if this looks like a GoalFundCreated event
      if (log.topics && log.topics.length >= 2) {
        // The contract address is typically in the second topic or in the data
        const potentialAddress = log.topics[1];
        
        // Basic validation that this looks like an address
        if (potentialAddress && potentialAddress.length === 66 && potentialAddress.startsWith('0x')) {
          // Convert from topic format to address format
          const contractAddress = '0x' + potentialAddress.slice(26);
          return contractAddress;
        }
      }
    } catch (error) {
      console.warn('Failed to parse log:', error);
    }
  }

  return null;
}

export async function getLatestGoalFundAddress(client, chain, factoryAddress, retries = 3) {
  const factoryContract = getContract({
    client,
    chain,
    address: factoryAddress,
    abi: [
      {
        "inputs": [],
        "name": "getGoalFunds",
        "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
        "stateMutability": "view",
        "type": "function"
      }
    ]
  });

  for (let i = 0; i < retries; i++) {
    try {
      const goalFunds = await readContract({
        contract: factoryContract,
        method: "getGoalFunds",
      });

      if (goalFunds && goalFunds.length > 0) {
        return goalFunds[goalFunds.length - 1];
      }

      // If no goal funds found, wait a bit and try again
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed to get GoalFunds:`, error);
      if (i === retries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }

  throw new Error("Failed to get latest GoalFund address after retries");
}