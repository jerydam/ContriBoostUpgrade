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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    chainId: 4202,
    name: "Lisk Sepolia",
    rpcUrl: "https://rpc.sepolia-api.lisk.com",
    contriboostFactory: "0x32C4F29AC9b7ed3fC9B202224c8419d2DCC45B06",
    goalFundFactory: "0x68fF2794A087da4B0A5247e9693eC4290D8eaE99",
    tokenAddress: "0x52Aee1645CA343515D12b6bd6FE24c026274e91D", // USDT
    tokenSymbol: "USDT",
    nativeSymbol: "ETH",
  },
  celo: {
    chainId: 44787,
    name: "Celo Alfajores",
    rpcUrl: "https://alfajores-forno.celo-testnet.org",
    contriboostFactory: "0x6C07EBb84bD92D6bBBaC6Cf2d4Ac0610Fab6e39F",
    goalFundFactory: "0x10883362beCE017EA51d643A2Dc6669bF47D2c99",
    tokenAddress: "0x053fc0352a16cDA6cF3FE0D28b80386f7B921540", // cUSD
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
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus || userStatus.isParticipant) {
      toast.error("You are already a participant or cannot join");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.join({ gasLimit: 200000 });
      console.log("Join Contriboost tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Successfully joined the Contriboost pool! Tx: ${tx.hash}`);
    } catch (error) {
      console.error("Error joining Contriboost:", error);
      let message = error.reason || error.message || "Failed to join";
      if (error.code === "CALL_EXCEPTION") {
        message = "Contract call failed: Check pool status or participant limit";
      }
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function depositContriboost() {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isParticipant || !userStatus?.isActive) {
      toast.warning("You must be an active participant to deposit");
      return;
    }
    if (poolDetails.status !== "active") {
      toast.warning("Deposits are only allowed when the pool is active");
      return;
    }
    if (!depositAmount || isNaN(depositAmount) || Number(depositAmount) <= 0) {
      toast.warning("Please enter a valid deposit amount");
      return;
    }

    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const amount = ethers.parseEther(depositAmount);

      console.log("Depositing to Contriboost:", {
        contractAddress,
        amount: depositAmount,
        tokenAddress: poolDetails.tokenAddress,
        user: account,
      });

      let tx;
      if (poolDetails.tokenAddress === ethers.ZeroAddress) {
        const balance = await provider.getBalance(account);
        if (balance < amount) {
          throw new Error(
            `Insufficient ${poolDetails.tokenSymbol} balance: ${ethers.formatEther(balance)} available`
          );
        }
        tx = await contract.deposit({ value: amount, gasLimit: 300000 });
      } else {
        const tokenContract = new ethers.Contract(poolDetails.tokenAddress, IERC20Abi, signer);
        const tokenBalance = await tokenContract.balanceOf(account);
        if (tokenBalance < amount) {
          throw new Error(
            `Insufficient ${poolDetails.tokenSymbol} balance: ${ethers.formatEther(tokenBalance)} available`
          );
        }
        const allowance = await tokenContract.allowance(account, contractAddress);
        if (allowance < amount) {
          console.log(`Approving ${poolDetails.tokenSymbol} allowance...`);
          const approveTx = await tokenContract.approve(contractAddress, amount, {
            gasLimit: 100000,
          });
          console.log("Approve tx hash:", approveTx.hash);
          await approveTx.wait();
        }
        tx = await contract.deposit({ gasLimit: 300000 });
      }

      console.log("Deposit Contriboost tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Deposit successful! Tx: ${tx.hash}`);
      setDepositAmount("");
    } catch (error) {
      console.error("Error depositing to Contriboost:", error);
      let message = "Failed to deposit";
      if (error.message.includes("insufficient funds")) {
        message = "Insufficient funds for deposit and gas fees";
      } else if (error.message.includes(`Insufficient ${poolDetails.tokenSymbol} balance`)) {
        message = error.message;
      } else if (error.reason) {
        message = error.reason;
      } else if (error.code === "CALL_EXCEPTION") {
        message = "Contract call failed: Check participant status or pool state";
      }
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function checkMissedDeposits() {
    if (!(await ensureCorrectNetwork())) return;
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.checkMissedDeposits({ gasLimit: 200000 });
      console.log("Check missed deposits tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Missed deposits checked successfully! Tx: ${tx.hash}`);
    } catch (error) {
      console.error("Error checking missed deposits:", error);
      let message = error.reason || error.message || "Failed to check missed deposits";
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function emergencyWithdraw(tokenAddress) {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isHost && !userStatus?.isOwner) {
      toast.warning("Only the host or owner nationalists can perform emergency withdrawal");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(
        contractAddress,
        poolType === "Contriboost" ? ContriboostAbi : GoalFundAbi,
        signer
      );
      const tx = poolType === "Contriboost"
        ? await contract.emergencyWithdraw(tokenAddress || ethers.ZeroAddress, { gasLimit: 300000 })
        : await contract.emergencyWithdraw({ gasLimit: 300000 });
      console.log("Emergency withdraw tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Emergency withdrawal successful! Tx: ${tx.hash}`);
    } catch (error) {
      console.error("Error performing emergency withdrawal:", error);
      let message = error.reason || error.message || "Failed to perform emergency withdrawal";
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function setDescription() {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isHost) {
      toast.warning("Only the host can set description");
      return;
    }
    if (!newDescription) {
      toast.warning("Please enter a new description");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.setDescription(newDescription, { gasLimit: 200000 });
      console.log("Set description tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Description updated successfully! Tx: ${tx.hash}`);
      setNewDescription("");
    } catch (error) {
      console.error("Error setting description:", error);
      let message = error.reason || error.message || "Failed to set description";
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function setHostFeePercentage() {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isHost) {
      toast.warning("Only the host can set host fee");
      return;
    }
    if (!newHostFee || isNaN(newHostFee) || Number(newHostFee) < 0) {
      toast.warning("Please enter a valid host fee percentage");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.setHostFeePercentage(
        Math.floor(Number(newHostFee) * 100),
        { gasLimit: 200000 }
      );
      console.log("Set host fee tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Host fee updated successfully! Tx: ${tx.hash}`);
      setNewHostFee("");
    } catch (error) {
      console.error("Error setting host fee:", error);
      let message = error.reason || error.message || "Failed to set host fee";
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function setTokenAddress() {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isHost) {
      toast.warning("Only the host can set token address");
      return;
    }
    if (!ethers.isAddress(newTokenAddress)) {
      toast.warning("Please enter a valid token address");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.setTokenAddress(newTokenAddress, { gasLimit: 200000 });
      console.log("Set token address tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Token address updated successfully! Tx: ${tx.hash}`);
      setNewTokenAddress("");
    } catch (error) {
      console.error("Error setting token address:", error);
      let message = error.reason || error.message || "Failed to set token address";
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function reactivateContriboost(participantAddress) {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isHost) {
      toast.warning("Only the host can reactivate participants");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const amount = ethers.parseEther(poolDetails.contributionAmount);
      const tx =
        poolDetails.tokenAddress === ethers.ZeroAddress
          ? await contract.reactivateParticipant(participantAddress, { value: amount, gasLimit: 300000 })
          : await contract.reactivateParticipant(participantAddress, { gasLimit: 300000 });
      console.log("Reactivate participant tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Successfully reactivated participant ${formatAddress(participantAddress)}! Tx: ${tx.hash}`);
    } catch (error) {
      console.error("Error reactivating in Contriboost:", error);
      let message = error.reason || error.message || "Failed to reactivate";
      if (error.code === "CALL_EXCEPTION") {
        message = "Contract call failed: Check missed deposits or pool state";
      }
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function distributeContriboostFunds() {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isHost) {
      toast.warning("Only the host can distribute funds");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.distributeFunds({ gasLimit: 500000 });
      console.log("Distribute funds tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Funds distributed successfully! Tx: ${tx.hash}`);
    } catch (error) {
      console.error("Error distributing funds:", error);
      let message = error.reason || error.message || "Failed to distribute funds";
      if (error.code === "CALL_EXCEPTION") {
        message = "Contract call failed: Check pool status or funds availability";
      }
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function transferOwnership() {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isHost && !userStatus?.isOwner) {
      toast.warning("Only the host or owner can transfer ownership");
      return;
    }
    if (!ethers.isAddress(newOwnerAddress)) {
      toast.warning("Please enter a valid owner address");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(
        contractAddress,
        poolType === "Contriboost" ? ContriboostAbi : GoalFundAbi,
        signer
      );
      const tx = await contract.transferOwnership(newOwnerAddress, { gasLimit: 200000 });
      console.log("Transfer ownership tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Ownership transferred successfully! Tx: ${tx.hash}`);
      setNewOwnerAddress("");
    } catch (error) {
      console.error("Error transferring ownership:", error);
      let message = error.reason || error.message || "Failed to transfer ownership";
      toast.error(`Error: ${message}`);
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
    if (!(await ensureCorrectNetwork())) return;
    if (poolDetails.status !== "active" || poolDetails.achieved) {
      toast.warning("Contributions are only allowed for active, non-achieved GoalFunds");
      return;
    }
    if (!contributeAmount || isNaN(contributeAmount) || Number(contributeAmount) <= 0) {
      toast.warning("Please enter a valid contribution amount");
      return;
    }

    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, GoalFundAbi, signer);
      const amount = ethers.parseEther(contributeAmount);

      console.log("Contributing to GoalFund:", {
        contractAddress,
        amount: contributeAmount,
        tokenAddress: poolDetails.tokenAddress,
        user: account,
      });

      let tx;
      if (poolDetails.tokenAddress === ethers.ZeroAddress) {
        const balance = await provider.getBalance(account);
        if (balance < amount) {
          throw new Error(
            `Insufficient ${poolDetails.tokenSymbol} balance: ${ethers.formatEther(balance)} available`
          );
        }
        tx = await contract.contribute({ value: amount, gasLimit: 300000 });
      } else {
        const tokenContract = new ethers.Contract(poolDetails.tokenAddress, IERC20Abi, signer);
        const tokenBalance = await tokenContract.balanceOf(account);
        if (tokenBalance < amount) {
          throw new Error(
            `Insufficient ${poolDetails.tokenSymbol} balance: ${ethers.formatEther(tokenBalance)} available`
          );
        }
        const allowance = await tokenContract.allowance(account, contractAddress);
        if (allowance < amount) {
          console.log(`Approving ${poolDetails.tokenSymbol} allowance...`);
          const approveTx = await tokenContract.approve(contractAddress, amount, {
            gasLimit: 100000,
          });
          console.log("Approve tx hash:", approveTx.hash);
          await approveTx.wait();
        }
        tx = await contract.contribute(amount, { gasLimit: 300000 });
      }

      console.log("Contribute GoalFund tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Contribution successful! Tx: ${tx.hash}`);
      setContributeAmount("");
    } catch (error) {
      console.error("Error contributing to GoalFund:", error);
      let message = "Failed to contribute";
      if (error.message.includes("insufficient funds")) {
        message = "Insufficient funds for contribution and gas fees";
      } else if (error.message.includes(`Insufficient ${poolDetails.tokenSymbol} balance`)) {
        message = error.message;
      } else if (error.reason) {
        message = error.reason;
      } else if (error.code === "CALL_EXCEPTION") {
        message = "Contract call failed: Check fund status or deadline";
      }
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function withdrawGoalFund() {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isBeneficiary && !userStatus?.isOwner) {
      toast.warning("Only the beneficiary or owner can withdraw funds");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, GoalFundAbi, signer);
      const tx = await contract.withdrawFunds({ gasLimit: 300000 });
      console.log("Withdraw GoalFund tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Funds withdrawn successfully! Tx: ${tx.hash}`);
    } catch (error) {
      console.error("Error withdrawing funds:", error);
      let message = error.reason || error.message || "Failed to withdraw funds";
      if (error.code === "CALL_EXCEPTION") {
        message = "Contract call failed: Check withdrawal conditions";
      }
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function refundContributors() {
    if (!(await ensureCorrectNetwork())) return;
    if (!userStatus?.isOwner) {
      toast.warning("Only the owner can issue refunds");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, GoalFundAbi, signer);
      const tx = await contract.refundContributors({ gasLimit: 500000 });
      console.log("Refund contributors tx hash:", tx.hash);
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Refunds issued successfully! Tx: ${tx.hash}`);
    } catch (error) {
      console.error("Error issuing refunds:", error);
      let message = error.reason || error.message || "Failed to issue refunds";
      if (error.code === "CALL_EXCEPTION") {
        message = "Contract call failed: Check refund conditions";
      }
      toast.error(`Error: ${message}`);
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
  const canDepositContriboost =
    isContriboost &&
    userStatus &&
    userStatus.isParticipant &&
    userStatus.isActive &&
    !userStatus.hasReceivedFunds &&
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
  const showDistributeContriboost =
    isContriboost && poolDetails.status === "active";
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
          {canCheckMissedDeposits && (
            <Button
              onClick={isCorrectNetwork ? checkMissedDeposits : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Check Missed Deposits" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          )}
          {canEmergencyWithdraw && (
            <Button
              onClick={isCorrectNetwork ? () => emergencyWithdraw(poolDetails.tokenAddress) : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Emergency Withdraw" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          )}
          {showDistributeContriboost && (
            <Button
              onClick={isCorrectNetwork ? distributeContriboostFunds : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting || !userStatus?.isHost}
              className="min-w-[120px]"
              title={!userStatus?.isHost ? "Only the pool host can distribute funds" : undefined}
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
        </div>
        {canSetDescription && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="newDescription">New Description</Label>
              <Input
                id="newDescription"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Enter new description"
                className="w-48"
              />
            </div>
            <Button
              onClick={isCorrectNetwork ? setDescription : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Set Description" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          </div>
        )}
        {canSetHostFee && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="newHostFee">New Host Fee (%)</Label>
              <Input
                id="newHostFee"
                type="number"
                value={newHostFee}
                onChange={(e) => setNewHostFee(e.target.value)}
                placeholder="Enter new host fee percentage"
                className="w-48"
              />
            </div>
            <Button
              onClick={isCorrectNetwork ? setHostFeePercentage : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Set Host Fee" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          </div>
        )}
        {canSetTokenAddress && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="newTokenAddress">New Token Address</Label>
              <Input
                id="newTokenAddress"
                value={newTokenAddress}
                onChange={(e) => setNewTokenAddress(e.target.value)}
                placeholder="Enter new token address"
                className="w-48"
              />
            </div>
            <Button
              onClick={isCorrectNetwork ? setTokenAddress : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Set Token Address" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          </div>
        )}
        {canTransferOwnership && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="newOwnerAddress">New Owner Address</Label>
              <Input
                id="newOwnerAddress"
                value={newOwnerAddress}
                onChange={(e) => setNewOwnerAddress(e.target.value)}
                placeholder="Enter new owner address"
                className="w-48"
              />
            </div>
            <Button
              onClick={isCorrectNetwork ? transferOwnership : () => switchNetwork(NETWORKS[network].chainId)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Transfer Ownership" : `Switch to ${NETWORKS[network].name}`}
            </Button>
          </div>
        )}
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