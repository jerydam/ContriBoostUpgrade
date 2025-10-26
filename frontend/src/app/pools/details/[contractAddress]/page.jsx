"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import {
  ContriboostFactoryAbi,
  ContriboostAbi,
  GoalFundFactoryAbi,
  GoalFundAbi,
} from "@/lib/contractabi";

import { generateDivviTag, submitDivviReferral } from "@/lib/divvi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, AlertCircle, DollarSign, Calendar, Users, Tag, Globe } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "react-toastify";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const IERC20Abi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

const NETWORKS = {
  lisk: {
    chainId: 1135,
    name: "Lisk",
    rpcUrl: "https://rpc.api.lisk.com",
    contriboostFactory: "YOUR_DEPLOYED_CONTRACT_ADDRESS", // Deploy your contract on mainnet
    goalFundFactory: "YOUR_DEPLOYED_CONTRACT_ADDRESS", // Deploy your contract on mainnet
    tokenAddress: "0x05D032ac25d322df992303dCa074EE7392C117b9", // USDT on Lisk
    tokenSymbol: "USDT",
    nativeSymbol: "ETH",
  },
  celo: {
    chainId: 42220,
    name: "Celo Mainnet",
    rpcUrl: "https://forno.celo.org",
    contriboostFactory: "YOUR_DEPLOYED_CONTRACT_ADDRESS", // Deploy your contract on mainnet
    goalFundFactory: "YOUR_DEPLOYED_CONTRACT_ADDRESS", // Deploy your contract on mainnet
    tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a", // cUSD on Celo
    tokenSymbol: "cUSD",
    nativeSymbol: "CELO",
  },
};
export default function PoolDetailsPage() {
  const { contractAddress } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { provider, signer, account, connect, isConnecting, chainId, switchNetwork } = useWeb3();
  const [poolDetails, setPoolDetails] = useState(null);
  const [poolType, setPoolType] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userStatus, setUserStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [contributeAmount, setContributeAmount] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newHostFee, setNewHostFee] = useState("");
  const [newTokenAddress, setNewTokenAddress] = useState("");
  const [newOwnerAddress, setNewOwnerAddress] = useState("");
  const [participants, setParticipants] = useState([]);
  const [network, setNetwork] = useState(null);
  // Added state to track if any deposits have been made
  const [hasDeposits, setHasDeposits] = useState(false);

  // Initialize providers
  const liskProvider = new ethers.JsonRpcProvider(NETWORKS.lisk.rpcUrl);
  const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);

  useEffect(() => {
    const networkParam = searchParams.get("network");
    if (networkParam && NETWORKS[networkParam]) {
      setNetwork(networkParam);
    } else {
      setError("Network not specified or invalid");
      setIsLoading(false);
      router.push("/pools");
      return;
    }
    if (!contractAddress || typeof contractAddress !== "string") {
      setError("No contract address provided");
      setIsLoading(false);
      router.push("/pools");
      return;
    }
    if (ethers.isAddress(contractAddress)) {
      fetchPoolDetails();
    } else {
      setError("Invalid contract address");
      setIsLoading(false);
      router.push("/pools");
    }
  }, [provider, contractAddress, searchParams, router, account, network]);

  async function fetchPoolDetails() {
    console.log("Fetching details for contract:", contractAddress, "on network:", network);
    setIsLoading(true);
    setError(null);

    const networkConfig = NETWORKS[network];
    const provider = network === "lisk" ? liskProvider : celoProvider;

    try {
      const contriboostFactory = new ethers.Contract(
        networkConfig.contriboostFactory,
        ContriboostFactoryAbi,
        provider
      );
      try {
        console.log("Attempting to fetch Contriboost details...");
        const contriboostDetails = await contriboostFactory.getSingleContriboostDetails(
          contractAddress
        );
        const contract = new ethers.Contract(contractAddress, ContriboostAbi, provider);
        const [
          description,
          currentSegment,
          startTimestamp,
          host,
          activeParticipants,
          allParticipants,
          participantStatus,
        ] = await Promise.all([
          contract.description(),
          contract.currentSegment(),
          contract.startTimestamp(),
          contract.host(),
          contract.getActiveParticipants(),
          contract.getAllParticipants(),
          account && chainId === networkConfig.chainId ? contract.getParticipantStatus(account) : null,
        ]);

        const participantDetails = await Promise.all(
          allParticipants.map(async (addr) => {
            const status = await contract.participants(addr);
            return {
              address: addr,
              id: Number(status.id),
              depositAmount: ethers.formatEther(status.depositAmount),
              lastDepositTime: Number(status.lastDepositTime),
              exists: status.exists,
              receivedFunds: status.receivedFunds,
              active: status.active,
              missedDeposits: Number(status.missedDeposits),
            };
          })
        );

        // Check if any participant has made a deposit
        const hasAnyDeposits = participantDetails.some(
          (participant) => parseFloat(participant.depositAmount) > 0
        );
        setHasDeposits(hasAnyDeposits);

        const now = Math.floor(Date.now() / 1000);
        let status = "not-started";
        if (now < startTimestamp) {
          status = "not-started";
        } else if (activeParticipants.length === 0 && currentSegment > contriboostDetails.expectedNumber) {
          status = "completed";
        } else if (Number(currentSegment) > 0) {
          status = "active";
        } else if (activeParticipants.length >= Number(contriboostDetails.expectedNumber)) {
          status = "full";
        }

        setPoolType("Contriboost");
        setPoolDetails({
          contractAddress: contriboostDetails.contractAddress,
          name: contriboostDetails.name,
          description: description || "No description provided",
          dayRange: Number(contriboostDetails.dayRange),
          expectedNumber: Number(contriboostDetails.expectedNumber),
          contributionAmount: ethers.formatEther(contriboostDetails.contributionAmount),
          tokenAddress: contriboostDetails.tokenAddress,
          tokenSymbol: contriboostDetails.tokenAddress === ethers.ZeroAddress
            ? networkConfig.nativeSymbol
            : networkConfig.tokenSymbol,
          hostFeePercentage: Number(contriboostDetails.hostFeePercentage),
          platformFeePercentage: Number(contriboostDetails.platformFeePercentage),
          maxMissedDeposits: Number(contriboostDetails.maxMissedDeposits),
          currentSegment: Number(currentSegment),
          startTimestamp: Number(startTimestamp),
          host,
          currentParticipants: activeParticipants.length,
          status,
        });
        setParticipants(participantDetails);
        setUserStatus(
          account && chainId === networkConfig.chainId
            ? {
                isParticipant: participantStatus.exists,
                isActive: participantStatus.active,
                hasReceivedFunds: participantStatus.receivedFunds,
                missedDeposits: Number(participantStatus.missedDeposits),
                isHost: account.toLowerCase() === host.toLowerCase(),
              }
            : null
        );
        setIsLoading(false);
        return;
      } catch (e) {
        console.log("Not a Contriboost:", e.message);
      }

      const goalFundFactory = new ethers.Contract(
        networkConfig.goalFundFactory,
        GoalFundFactoryAbi,
        provider
      );
      try {
        console.log("Attempting to fetch GoalFund details...");
        const goalFundDetails = await goalFundFactory.getSingleGoalFundDetails(contractAddress);
        const contract = new ethers.Contract(contractAddress, GoalFundAbi, provider);
        const [balance, contributorCount, userContribution, goal, owner] = await Promise.all([
          contract.getBalance(),
          contract.getContributorCount(),
          account && chainId === networkConfig.chainId ? contract.contributions(account) : 0,
          contract.goal(),
          contract.owner(),
        ]);
        const now = Math.floor(Date.now() / 1000);
        const status = goalFundDetails.achieved
          ? "achieved"
          : now > Number(goalFundDetails.deadline)
          ? "expired"
          : "active";

        setPoolType("GoalFund");
        setPoolDetails({
          contractAddress: goalFundDetails.contractAddress,
          name: goalFundDetails.name,
          description: goal.description || "No description provided",
          targetAmount: ethers.formatEther(goalFundDetails.targetAmount),
          currentAmount: ethers.formatEther(balance),
          deadline: Number(goalFundDetails.deadline),
          beneficiary: goalFundDetails.beneficiary,
          tokenAddress: goalFundDetails.tokenAddress,
          tokenSymbol: goalFundDetails.tokenAddress === ethers.ZeroAddress
            ? networkConfig.nativeSymbol
            : networkConfig.tokenSymbol,
          fundType: Number(goalFundDetails.fundType),
          platformFeePercentage: Number(goalFundDetails.platformFeePercentage),
          contributors: Number(contributorCount),
          status,
          userContribution: ethers.formatEther(userContribution),
          achieved: goalFundDetails.achieved,
          fundsWithdrawn: goal.fundsWithdrawn,
        });
        setUserStatus(
          account && chainId === networkConfig.chainId
            ? {
                hasContributed: Number(ethers.formatEther(userContribution)) > 0,
                isOwner: account.toLowerCase() === owner.toLowerCase(),
                isBeneficiary: account.toLowerCase() === goalFundDetails.beneficiary.toLowerCase(),
              }
            : null
        );
        setIsLoading(false);
      } catch (e) {
        console.error("Not a GoalFund:", e.message);
        throw new Error("Contract not found or inaccessible");
      }
    } catch (error) {
      console.error("Failed to fetch pool details:", error.message);
      setError("Failed to load pool details. Check the contract address and network.");
      setPoolDetails(null);
      setUserStatus(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function ensureCorrectNetwork() {
    if (!account) {
      await connect();
      if (!account) {
        toast.error("Please connect your wallet");
        return false;
      }
    }
    if (chainId !== NETWORKS[network].chainId) {
      try {
        await switchNetwork(NETWORKS[network].chainId);
        return true;
      } catch (error) {
        toast.error(`Please switch to ${NETWORKS[network].name} in your wallet`);
        return false;
      }
    }
    return true;
  }

  async function joinContriboost() {
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.joinContriboost.populateTransaction();
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Join Contriboost transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Successfully joined Contriboost!");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error joining Contriboost:", err);
    toast.error("Failed to join Contriboost");
  } finally {
    setIsProcessing(false);
  }
}

  async function depositContriboost() {
  if (!depositAmount || parseFloat(depositAmount) <= 0) {
    toast.error("Please enter a valid deposit amount");
    return;
  }

  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    const amount = ethers.parseEther(depositAmount);
    
    // Handle token approval for ERC20 tokens if needed
    if (!isNative) {
      const tokenContract = new ethers.Contract(poolDetails.tokenAddress, IERC20Abi, signer);
      
      // Approval transaction - ADD DIVVI HERE TOO
      const referralTagApproval = generateDivviTag(account);
      const populatedApproval = await tokenContract.approve.populateTransaction(contractAddress, amount);
      populatedApproval.data = populatedApproval.data + referralTagApproval.slice(2);
      const approveTx = await signer.sendTransaction(populatedApproval);
      await approveTx.wait();
      await submitDivviReferral(approveTx.hash, chainId);
      
      toast.info("Token approval successful");
    }

    // 🎯 DIVVI: Generate referral tag for deposit
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.deposit.populateTransaction(
      isNative ? { value: amount } : {}
    );
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Add value for native token if needed
    if (isNative) {
      populatedTx.value = amount;
    }
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Deposit transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Deposit successful!");
    setDepositAmount("");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error depositing:", err);
    toast.error("Failed to deposit");
  } finally {
    setIsProcessing(false);
  }
}

  async function checkMissedDeposits() {
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.checkMissedDeposits.populateTransaction();
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Check missed deposits transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Missed deposits checked successfully!");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error checking missed deposits:", err);
    toast.error("Failed to check missed deposits");
  } finally {
    setIsProcessing(false);
  }
}

  async function emergencyWithdraw() {
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.emergencyWithdraw.populateTransaction();
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Emergency withdraw transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Emergency withdrawal successful!");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error in emergency withdrawal:", err);
    toast.error("Failed to perform emergency withdrawal");
  } finally {
    setIsProcessing(false);
  }
}

  async function setDescription() {
  if (!newDescription) {
    toast.error("Please enter a description");
    return;
  }
  
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.setDescription.populateTransaction(newDescription);
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Set description transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Description updated successfully!");
    setNewDescription("");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error setting description:", err);
    toast.error("Failed to update description");
  } finally {
    setIsProcessing(false);
  }
}

  async function setHostFeePercentage() {
  if (!newHostFee || parseFloat(newHostFee) < 0 || parseFloat(newHostFee) > 5) {
    toast.error("Please enter a valid host fee (0-5%)");
    return;
  }
  
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    const feeInBasisPoints = Math.floor(parseFloat(newHostFee) * 100);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.setHostFeePercentage.populateTransaction(feeInBasisPoints);
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Set host fee transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Host fee updated successfully!");
    setNewHostFee("");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error setting host fee:", err);
    toast.error("Failed to update host fee");
  } finally {
    setIsProcessing(false);
  }
}

  async function setTokenAddress() {
  if (!newTokenAddress || !ethers.isAddress(newTokenAddress)) {
    toast.error("Please enter a valid token address");
    return;
  }
  
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.setTokenAddress.populateTransaction(newTokenAddress);
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Set token address transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Token address updated successfully!");
    setNewTokenAddress("");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error setting token address:", err);
    toast.error("Failed to update token address");
  } finally {
    setIsProcessing(false);
  }
}

  async function reactivateContriboost(participantAddress) {
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.reactivateParticipant.populateTransaction(participantAddress);
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Reactivate transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Participant reactivated successfully!");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error reactivating participant:", err);
    toast.error("Failed to reactivate participant");
  } finally {
    setIsProcessing(false);
  }
}

  async function distributeContriboostFunds() {
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.distributeFunds.populateTransaction();
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Distribute funds transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Funds distributed successfully!");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error distributing funds:", err);
    toast.error("Failed to distribute funds");
  } finally {
    setIsProcessing(false);
  }
}

  async function transferOwnership() {
  if (!newOwnerAddress || !ethers.isAddress(newOwnerAddress)) {
    toast.error("Please enter a valid owner address");
    return;
  }
  
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.transferOwnership.populateTransaction(newOwnerAddress);
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Transfer ownership transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Ownership transferred successfully!");
    setNewOwnerAddress("");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error transferring ownership:", err);
    toast.error("Failed to transfer ownership");
  } finally {
    setIsProcessing(false);
  }
}

  async function exitContriboost() {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isParticipant) {
      toast.warning("You are not a participant in this pool");
      return;
    }
    if (poolDetails.status !== "not-started") {
      toast.warning("You can only exit before the pool starts");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.exitContriboost({ gasLimit: 200000 });
      console.log("Exit Contriboost tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Successfully exited the Contriboost pool! Tx: ${tx.hash}`);
    } catch (error) {
      console.error("Error exiting Contriboost:", error);
      let message = error.reason || error.message || "Failed to exit";
      if (error.code === "CALL_EXCEPTION") {
        message = "Contract call failed: Check pool status or participant status";
      }
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function contributeGoalFund() {
  if (!contributeAmount || parseFloat(contributeAmount) <= 0) {
    toast.error("Please enter a valid contribution amount");
    return;
  }

  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, GoalFundAbi, signer);
    const amount = ethers.parseEther(contributeAmount);

    // Handle token approval for ERC20 tokens if needed
    if (!isNative) {
      const tokenContract = new ethers.Contract(poolDetails.tokenAddress, IERC20Abi, signer);
      
      // Approval transaction with Divvi
      const referralTagApproval = generateDivviTag(account);
      const populatedApproval = await tokenContract.approve.populateTransaction(contractAddress, amount);
      populatedApproval.data = populatedApproval.data + referralTagApproval.slice(2);
      const approveTx = await signer.sendTransaction(populatedApproval);
      await approveTx.wait();
      await submitDivviReferral(approveTx.hash, chainId);
      
      toast.info("Token approval successful");
    }

    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.contribute.populateTransaction(
      isNative ? { value: amount } : {}
    );
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    if (isNative) {
      populatedTx.value = amount;
    }
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Contribute transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Contribution successful!");
    setContributeAmount("");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error contributing:", err);
    toast.error("Failed to contribute");
  } finally {
    setIsProcessing(false);
  }
}

  async function withdrawGoalFund() {
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, GoalFundAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.withdraw.populateTransaction();
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Withdraw transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Withdrawal successful!");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error withdrawing:", err);
    toast.error("Failed to withdraw");
  } finally {
    setIsProcessing(false);
  }
}

  async function refundContributors() {
  setIsProcessing(true);
  try {
    const contract = new ethers.Contract(contractAddress, GoalFundAbi, signer);
    
    // 🎯 DIVVI: Generate referral tag
    const referralTag = generateDivviTag(account);
    
    // 🎯 DIVVI: Populate transaction
    const populatedTx = await contract.refund.populateTransaction();
    
    // 🎯 DIVVI: Append referral tag
    populatedTx.data = populatedTx.data + referralTag.slice(2);
    
    // Send transaction
    const tx = await signer.sendTransaction(populatedTx);
    console.log("Refund transaction:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);
    
    // 🎯 DIVVI: Submit referral
    await submitDivviReferral(tx.hash, chainId);
    
    toast.success("Refund processed successfully!");
    fetchPoolDetails();
  } catch (err) {
    console.error("Error processing refund:", err);
    toast.error("Failed to process refund");
  } finally {
    setIsProcessing(false);
  }
}

  function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>Loading pool details...</span>
      </div>
    );
  }

  if (error || !poolDetails || !network) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Pool not found or inaccessible"}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <a href="/pools">Back to Pools</a>
        </Button>
      </div>
    );
  }

  const isContriboost = poolType === "Contriboost";
  const isNative = poolDetails.tokenAddress === ethers.ZeroAddress;
  const canJoinContriboost =
    isContriboost &&
    userStatus &&
    !userStatus.isParticipant &&
    poolDetails.status !== "full" &&
    poolDetails.status !== "completed" &&
    poolDetails.currentParticipants < poolDetails.expectedNumber;
  // Modified to allow deposits regardless of hasReceivedFunds
  const canDepositContriboost =
    isContriboost &&
    userStatus &&
    userStatus.isParticipant &&
    userStatus.isActive &&
    poolDetails.status === "active";
  const isDepositDisabled = poolDetails.status === "completed";
  const canCheckMissedDeposits =
    isContriboost &&
    userStatus &&
    userStatus.isHost &&
    poolDetails.status === "active";
  const canEmergencyWithdraw =
    userStatus &&
    (userStatus.isHost || userStatus.isOwner);
  const canSetDescription =
    isContriboost &&
    userStatus &&
    userStatus.isHost;
  const canSetHostFee =
    isContriboost &&
    userStatus &&
    userStatus.isHost;
  const canSetTokenAddress =
    isContriboost &&
    userStatus &&
    userStatus.isHost;
  // Modified to only show distribute button if deposits exist and user is host
  const showDistributeContriboost =
    isContriboost && poolDetails.status === "active" && hasDeposits && userStatus?.isHost;
  const canTransferOwnership =
    userStatus &&
    (userStatus.isHost || userStatus.isOwner);
  const canContributeGoalFund =
    !isContriboost && poolDetails.status === "active" && !poolDetails.achieved;
  const canWithdrawGoalFund =
    !isContriboost &&
    userStatus &&
    (userStatus.isBeneficiary || userStatus.isOwner) &&
    poolDetails.achieved &&
    !poolDetails.fundsWithdrawn;
  const canRefundGoalFund =
    !isContriboost &&
    userStatus &&
    userStatus.isOwner &&
    poolDetails.status === "expired" &&
    !poolDetails.achieved;
  const isCorrectNetwork = chainId === NETWORKS[network].chainId;

  // Admin Actions Dialog Component
  function AdminActionsDialog() {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            disabled={isProcessing || isConnecting}
            className="min-w-[120px]"
          >
            Admin Actions
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Admin Actions</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {canSetDescription && (
              <div className="space-y-2">
                <Label htmlFor="newDescription">New Description</Label>
                <Input
                  id="newDescription"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Enter new description"
                />
                <Button
                  onClick={isCorrectNetwork ? setDescription : () => switchNetwork(NETWORKS[network].chainId)}
                  disabled={isProcessing || isConnecting}
                  className="w-full"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isCorrectNetwork ? "Set Description" : `Switch to ${NETWORKS[network].name}`}
                </Button>
              </div>
            )}
            {canSetHostFee && (
              <div className="space-y-2">
                <Label htmlFor="newHostFee">New Host Fee (%)</Label>
                <Input
                  id="newHostFee"
                  type="number"
                  value={newHostFee}
                  onChange={(e) => setNewHostFee(e.target.value)}
                  placeholder="Enter new host fee percentage"
                />
                <Button
                  onClick={isCorrectNetwork ? setHostFeePercentage : () => switchNetwork(NETWORKS[network].chainId)}
                  disabled={isProcessing || isConnecting}
                  className="w-full"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isCorrectNetwork ? "Set Host Fee" : `Switch to ${NETWORKS[network].name}`}
                </Button>
              </div>
            )}
            {canSetTokenAddress && (
              <div className="space-y-2">
                <Label htmlFor="newTokenAddress">New Token Address</Label>
                <Input
                  id="newTokenAddress"
                  value={newTokenAddress}
                  onChange={(e) => setNewTokenAddress(e.target.value)}
                  placeholder="Enter new token address"
                />
                <Button
                  onClick={isCorrectNetwork ? setTokenAddress : () => switchNetwork(NETWORKS[network].chainId)}
                  disabled={isProcessing || isConnecting}
                  className="w-full"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isCorrectNetwork ? "Set Token Address" : `Switch to ${NETWORKS[network].name}`}
                </Button>
              </div>
            )}
            {canTransferOwnership && (
              <div className="space-y-2">
                <Label htmlFor="newOwnerAddress">New Owner Address</Label>
                <Input
                  id="newOwnerAddress"
                  value={newOwnerAddress}
                  onChange={(e) => setNewOwnerAddress(e.target.value)}
                  placeholder="Enter new owner address"
                />
                <Button
                  onClick={isCorrectNetwork ? transferOwnership : () => switchNetwork(NETWORKS[network].chainId)}
                  disabled={isProcessing || isConnecting}
                  className="w-full"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isCorrectNetwork ? "Transfer Ownership" : `Switch to ${NETWORKS[network].name}`}
                </Button>
              </div>
            )}
            {canEmergencyWithdraw && (
              <div className="space-y-2">
                <Button
                  onClick={isCorrectNetwork ? () => emergencyWithdraw(poolDetails.tokenAddress) : () => switchNetwork(NETWORKS[network].chainId)}
                  disabled={isProcessing || isConnecting}
                  className="w-full"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isCorrectNetwork ? "Emergency Withdraw" : `Switch to ${NETWORKS[network].name}`}
                </Button>
              </div>
            )}
            {canCheckMissedDeposits && (
              <div className="space-y-2">
                <Button
                  onClick={isCorrectNetwork ? checkMissedDeposits : () => switchNetwork(NETWORKS[network].chainId)}
                  disabled={isProcessing || isConnecting}
                  className="w-full"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isCorrectNetwork ? "Check Missed Deposits" : `Switch to ${NETWORKS[network].name}`}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          {poolDetails.name}
          <span className="text-xs bg-purple-100 text-purple-800 py-0.5 px-1.5 rounded-full flex items-center">
            <Tag className="h-3 w-3 mr-1" />
            {poolType}
          </span>
          {!isContriboost && (
            <span className="text-xs bg-blue-100 text-blue-800 py-0.5 px-1.5 rounded-full flex items-center">
              <Tag className="h-3 w-3 mr-1" />
              {poolDetails.fundType === 0 ? "Grouped" : "Personal"}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground break-words max-w-2xl">{poolDetails.description}</p>
        <div className="flex items-center gap-1 mt-1">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{NETWORKS[network].name}</span>
        </div>
        {!isCorrectNetwork && (
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => switchNetwork(NETWORKS[network].chainId)}
            disabled={isConnecting}
          >
            {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Switch to {NETWORKS[network].name}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {isContriboost ? "Participants" : "Contributors"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Users className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {isContriboost
                  ? `${poolDetails.currentParticipants}/${poolDetails.expectedNumber}`
                  : poolDetails.contributors}
              </span>
            </div>
            {isContriboost ? (
              <Progress
                value={(poolDetails.currentParticipants / poolDetails.expectedNumber) * 100}
                className="h-2 mt-2"
              />
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Your contribution: {poolDetails.userContribution} {poolDetails.tokenSymbol}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {isContriboost ? "Current Cycle" : "Deadline"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {isContriboost ? poolDetails.currentSegment : formatDate(poolDetails.deadline)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isContriboost
                ? `Started on ${formatDate(poolDetails.startTimestamp)}`
                : `Status: ${poolDetails.status}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {isContriboost ? "Contribution Amount" : "Funding Progress"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {isContriboost
                  ? `${poolDetails.contributionAmount} ${poolDetails.tokenSymbol}`
                  : `${poolDetails.currentAmount}/${poolDetails.targetAmount} ${poolDetails.tokenSymbol}`}
              </span>
            </div>
            {isContriboost ? (
              <p className="text-xs text-muted-foreground mt-1">
                Host fee: {poolDetails.hostFeePercentage / 100}% | Platform fee:{" "}
                {poolDetails.platformFeePercentage / 100}%
              </p>
            ) : (
              <Progress
                value={
                  (Number.parseFloat(poolDetails.currentAmount) /
                    Number.parseFloat(poolDetails.targetAmount)) *
                  100
                }
                className="h-2 mt-2"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-8 space-y-4">
        {canJoinContriboost && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={isCorrectNetwork ? joinContriboost : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Join" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          </div>
        )}
        {canDepositContriboost && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="depositAmount">Deposit Amount ({poolDetails.tokenSymbol})</Label>
              <Input
                id="depositAmount"
                type="number"
                step="0.000000000000000001"
                min="0"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder={`Required: ${poolDetails.contributionAmount}`}
                className="w-48"
                disabled={isDepositDisabled}
              />
            </div>
            <Button
              onClick={isCorrectNetwork ? depositContriboost : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting || isDepositDisabled}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? (isDepositDisabled ? "Pool Completed" : "Deposit") : `Switch to ${NETWORKS[network].name}`}
            </Button>
          </div>
        )}
        {isContriboost && userStatus?.isParticipant && poolDetails.status === "not-started" && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={isCorrectNetwork ? exitContriboost : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
              variant="destructive"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Exit Pool" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          </div>
        )}
        {canContributeGoalFund && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="contributeAmount">Contribution Amount ({poolDetails.tokenSymbol})</Label>
              <Input
                id="contributeAmount"
                type="number"
                value={contributeAmount}
                onChange={(e) => setContributeAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-48"
              />
            </div>
            <Button
              onClick={isCorrectNetwork ? contributeGoalFund : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Contribute" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {showDistributeContriboost && (
            <Button
              onClick={isCorrectNetwork ? distributeContriboostFunds : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Distribute Funds" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          )}
          {canWithdrawGoalFund && (
            <Button
              onClick={isCorrectNetwork ? withdrawGoalFund : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Withdraw Funds" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          )}
          {canRefundGoalFund && (
            <Button
              onClick={isCorrectNetwork ? refundContributors : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Refund Contributors" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          )}
          {(canEmergencyWithdraw || canCheckMissedDeposits || canSetDescription || canSetHostFee || canSetTokenAddress || canTransferOwnership) && (
            <AdminActionsDialog />
          )}
        </div>
      </div>

      {isContriboost && participants.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Participants</CardTitle>
            <CardDescription>
              List of all participants in this Contriboost pool
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deposit Amount</TableHead>
                  <TableHead>Missed Deposits</TableHead>
                  <TableHead>Last Deposit</TableHead>
                  {userStatus?.isHost && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.map((participant) => (
                  <TableRow key={participant.address}>
                    <TableCell>{formatAddress(participant.address)}</TableCell>
                    <TableCell>
                      {participant.receivedFunds
                        ? "Received Funds"
                        : participant.active
                        ? "Active"
                        : "Inactive"}
                    </TableCell>
                    <TableCell>
                      {parseFloat(participant.depositAmount).toFixed(4)} {poolDetails.tokenSymbol}
                    </TableCell>
                    <TableCell>{participant.missedDeposits}</TableCell>
                    <TableCell>
                      {participant.lastDepositTime > 0
                        ? formatDate(participant.lastDepositTime)
                        : "N/A"}
                    </TableCell>
                    {userStatus?.isHost && (
                      <TableCell>
                        {!participant.active &&
                          !participant.receivedFunds &&
                          participant.missedDeposits > 0 && (
                            <Button
                              size="sm"
                              onClick={() => reactivateContriboost(participant.address)}
                              disabled={isProcessing}
                            >
                              Reactivate
                            </Button>
                          )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Pool Details</CardTitle>
          <CardDescription>Key information about this {poolType} pool</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Contract Address</TableCell>
                <TableCell>{poolDetails.contractAddress}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Name</TableCell>
                <TableCell>{poolDetails.name}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Network</TableCell>
                <TableCell>{NETWORKS[network].name}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Token</TableCell>
                <TableCell>
                  {isNative ? poolDetails.tokenSymbol : formatAddress(poolDetails.tokenAddress)}
                </TableCell>
              </TableRow>
              {isContriboost ? (
                <>
                  <TableRow>
                    <TableCell className="font-medium">Day Range</TableCell>
                    <TableCell>{poolDetails.dayRange} days</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Expected Participants</TableCell>
                    <TableCell>{poolDetails.expectedNumber}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Max Missed Deposits</TableCell>
                    <TableCell>{poolDetails.maxMissedDeposits}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Host Address</TableCell>
                    <TableCell>{formatAddress(poolDetails.host)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Start Date</TableCell>
                    <TableCell>{formatDate(poolDetails.startTimestamp)}</TableCell>
                  </TableRow>
                </>
              ) : (
                <>
                  <TableRow>
                    <TableCell className="font-medium">Target Amount</TableCell>
                    <TableCell>
                      {poolDetails.targetAmount} {poolDetails.tokenSymbol}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Current Amount</TableCell>
                    <TableCell>
                      {poolDetails.currentAmount} {poolDetails.tokenSymbol}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Beneficiary</TableCell>
                    <TableCell>{formatAddress(poolDetails.beneficiary)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Fund Type</TableCell>
                    <TableCell>{poolDetails.fundType === 0 ? "Grouped" : "Personal"}</TableCell>
                  </TableRow>
                </>
              )}
              <TableRow>
                <TableCell className="font-medium">Platform Fee</TableCell>
                <TableCell>{poolDetails.platformFeePercentage / 100}%</TableCell>
              </TableRow>
              {isContriboost && (
                <TableRow>
                  <TableCell className="font-medium">Host Fee</TableCell>
                  <TableCell>{poolDetails.hostFeePercentage / 100}%</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Button variant="outline" asChild>
        <a href="/pools">Back to Pools</a>
      </Button>
    </div>
  );
}