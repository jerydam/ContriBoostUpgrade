"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ethers } from "ethers";
import { getContract, prepareContractCall, sendTransaction } from "thirdweb";
import { useWeb3 } from "@/components/providers/web3-provider";
import {
  ContriboostFactoryAbi,
  ContriboostAbi,
  GoalFundFactoryAbi,
  GoalFundAbi,
} from "@/lib/contractabi";
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
  celo: {
    chainId: 44787,
    name: "Celo Alfajores",
    rpcUrl: "https://alfajores-forno.celo-testnet.org",
    contriboostFactory: "0x4C9118aBffa2aCCa4a16d08eC1222634eb744748",
    goalFundFactory: "0x64547A48C57583C8f595D97639543E2f1b6db4a6",
    tokenAddress: "0xFE18f2C089f8fdCC843F183C5aBdeA7fa96C78a8", // cUSD
    tokenSymbol: "cUSD",
    nativeSymbol: "CELO",
  },
};

export default function PoolDetailsPage() {
  const { contractAddress } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { provider, signer, account, connect, isConnecting, chainId, switchNetwork, thirdwebClient, celoAlfajores } = useWeb3();
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
  const [hasDeposits, setHasDeposits] = useState(false);
  const [accumulatedRewards, setAccumulatedRewards] = useState("0");
  const [rewardTransferAmount, setRewardTransferAmount] = useState("");
  const [rewardTransferAddress, setRewardTransferAddress] = useState("");
  const [isFactoryOwner, setIsFactoryOwner] = useState(false);

  const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);

  useEffect(() => {
    const networkParam = searchParams.get("network");
    if (networkParam !== "celo") {
      setError("Only Celo Alfajores network is supported");
      setIsLoading(false);
      router.push("/pools");
      return;
    }
    setNetwork("celo");
    if (!contractAddress || typeof contractAddress !== "string") {
      setError("No contract address provided");
      setIsLoading(false);
      router.push("/pools");
      return;
    }
    if (ethers.isAddress(contractAddress)) {
      fetchPoolDetails();
      checkFactoryOwner();
    } else {
      setError("Invalid contract address");
      setIsLoading(false);
      router.push("/pools");
    }
  }, [provider, contractAddress, searchParams, router, account, chainId]);

  async function checkFactoryOwner() {
    if (!account || chainId !== NETWORKS.celo.chainId) {
      setIsFactoryOwner(false);
      return;
    }
    try {
      const goalFundFactory = new ethers.Contract(
        NETWORKS.celo.goalFundFactory,
        GoalFundFactoryAbi,
        celoProvider
      );
      const owner = await goalFundFactory.owner();
      setIsFactoryOwner(account.toLowerCase() === owner.toLowerCase());
    } catch (error) {
      console.error("Error checking factory owner:", error);
      setIsFactoryOwner(false);
    }
  }

  async function fetchPoolDetails() {
    setIsLoading(true);
    setError(null);

    const networkConfig = NETWORKS.celo;

    try {
      const contriboostFactory = new ethers.Contract(
        networkConfig.contriboostFactory,
        ContriboostFactoryAbi,
        celoProvider
      );
      try {
        const contriboostDetails = await contriboostFactory.getSingleContriboostDetails(
          contractAddress
        );
        const contract = new ethers.Contract(contractAddress, ContriboostAbi, celoProvider);
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
        setAccumulatedRewards("0");
        setIsLoading(false);
        return;
      } catch (e) {
        console.log("Not a Contriboost:", e.message);
      }

      const goalFundFactory = new ethers.Contract(
        networkConfig.goalFundFactory,
        GoalFundFactoryAbi,
        celoProvider
      );
      try {
        const goalFundDetails = await goalFundFactory.getSingleGoalFundDetails(contractAddress);
        const contract = new ethers.Contract(contractAddress, GoalFundAbi, celoProvider);
        const [balance, contributorCount, userContribution, goal, owner, accumulatedRewards] = await Promise.all([
          contract.getBalance(),
          contract.getContributorCount(),
          account && chainId === networkConfig.chainId ? contract.contributions(account) : 0,
          contract.goal(),
          contract.owner(),
          account && chainId === networkConfig.chainId ? contract.getAccumulatedRewards(account) : 0,
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
                accumulatedRewards: ethers.formatEther(accumulatedRewards),
              }
            : null
        );
        setAccumulatedRewards(ethers.formatEther(accumulatedRewards));
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
      setAccumulatedRewards("0");
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
    if (chainId !== NETWORKS.celo.chainId) {
      try {
        await switchNetwork(NETWORKS.celo.chainId);
        return true;
      } catch (error) {
        console.error("Network switch error:", error);
        toast.error(`Please switch to ${NETWORKS.celo.name} in your wallet`);
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

    try {
      const response = await fetch(`/api/verify/status/${account}`);
      const data = await response.json();
      if (!data.verified) {
        toast.error("You must be verified to join a Contriboost pool");
        router.push("/verify");
        return;
      }
    } catch (error) {
      console.error("Error checking verification status:", error);
      toast.error("Error checking verification status");
      router.push("/verify");
      return;
    }

    setIsProcessing(true);
    try {
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: ContriboostAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "join",
        params: [],
        gas: 200000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Join Contriboost tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Successfully joined the Contriboost pool!`);
    } catch (error) {
      console.error("Error joining Contriboost:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to join"}`);
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
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: ContriboostAbi,
      });

      const amount = ethers.parseEther(depositAmount);

      if (poolDetails.tokenAddress === ethers.ZeroAddress) {
        const balance = await provider.getBalance(account);
        if (balance < amount) {
          throw new Error(`Insufficient CELO balance: ${ethers.formatEther(balance)} available`);
        }
      } else {
        const tokenContract = new ethers.Contract(poolDetails.tokenAddress, IERC20Abi, signer);
        const tokenBalance = await tokenContract.balanceOf(account);
        if (tokenBalance < amount) {
          throw new Error(`Insufficient cUSD balance: ${ethers.formatEther(tokenBalance)} available`);
        }
        const allowance = await tokenContract.allowance(account, contractAddress);
        if (allowance < amount) {
          console.log(`Approving cUSD allowance...`);
          const approveTx = await tokenContract.approve(contractAddress, amount, { gasLimit: 100000 });
          await approveTx.wait();
        }
      }

      const transaction = await prepareContractCall({
        contract,
        method: "deposit",
        params: [],
        value: poolDetails.tokenAddress === ethers.ZeroAddress ? amount : 0n,
        gas: 300000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Deposit Contriboost tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Deposit successful!`);
      setDepositAmount("");
    } catch (error) {
      console.error("Error depositing to Contriboost:", error);
      toast.error(`Error: ${error.message || "Failed to deposit"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function checkMissedDeposits() {
    if (!(await ensureCorrectNetwork())) return;
    setIsProcessing(true);
    try {
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: ContriboostAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "checkMissedDeposits",
        params: [],
        gas: 200000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Check missed deposits tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Missed deposits checked successfully!`);
    } catch (error) {
      console.error("Error checking missed deposits:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to check missed deposits"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function emergencyWithdraw(tokenAddress) {
    if (!(await ensureCorrectNetwork())) return;
    setIsProcessing(true);
    try {
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: poolType === "Contriboost" ? ContriboostAbi : GoalFundAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "emergencyWithdraw",
        params: poolType === "Contriboost" ? [tokenAddress || ethers.ZeroAddress] : [],
        gas: 300000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Emergency withdraw tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Emergency withdrawal successful!`);
    } catch (error) {
      console.error("Error performing emergency withdrawal:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to perform emergency withdrawal"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function setDescription() {
    if (!(await ensureCorrectNetwork())) return;
    if (!newDescription) {
      toast.warning("Please enter a new description");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: ContriboostAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "setDescription",
        params: [newDescription],
        gas: 200000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Set description tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Description updated successfully!`);
      setNewDescription("");
    } catch (error) {
      console.error("Error setting description:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to set description"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function setHostFeePercentage() {
    if (!(await ensureCorrectNetwork())) return;
    if (!newHostFee || isNaN(newHostFee) || Number(newHostFee) < 0) {
      toast.warning("Please enter a valid host fee percentage");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: ContriboostAbi,
      });

      const hostFee = Math.floor(Number(newHostFee) * 100);

      const transaction = await prepareContractCall({
        contract,
        method: "setHostFeePercentage",
        params: [hostFee],
        gas: 200000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Set host fee tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Host fee updated successfully!`);
      setNewHostFee("");
    } catch (error) {
      console.error("Error setting host fee:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to set host fee"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function setTokenAddress() {
    if (!(await ensureCorrectNetwork())) return;
    if (!ethers.isAddress(newTokenAddress)) {
      toast.warning("Please enter a valid token address");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: ContriboostAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "setTokenAddress",
        params: [newTokenAddress],
        gas: 200000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Set token address tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Token address updated successfully!`);
      setNewTokenAddress("");
    } catch (error) {
      console.error("Error setting token address:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to set token address"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function reactivateContriboost(participantAddress) {
    if (!(await ensureCorrectNetwork())) return;
    setIsProcessing(true);
    try {
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: ContriboostAbi,
      });

      const amount = ethers.parseEther(poolDetails.contributionAmount);

      if (poolDetails.tokenAddress !== ethers.ZeroAddress) {
        const tokenContract = new ethers.Contract(poolDetails.tokenAddress, IERC20Abi, signer);
        const allowance = await tokenContract.allowance(account, contractAddress);
        if (allowance < amount) {
          const approveTx = await tokenContract.approve(contractAddress, amount, { gasLimit: 100000 });
          await approveTx.wait();
        }
      }

      const transaction = await prepareContractCall({
        contract,
        method: "reactivateParticipant",
        params: [participantAddress],
        value: poolDetails.tokenAddress === ethers.ZeroAddress ? amount : 0n,
        gas: 300000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Reactivate participant tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Successfully reactivated participant ${formatAddress(participantAddress)}!`);
    } catch (error) {
      console.error("Error reactivating in Contriboost:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to reactivate"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function distributeContriboostFunds() {
    if (!(await ensureCorrectNetwork())) return;
    setIsProcessing(true);
    try {
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: ContriboostAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "distributeFunds",
        params: [],
        gas: 500000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Distribute funds tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Funds distributed successfully!`);
    } catch (error) {
      console.error("Error distributing funds:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to distribute funds"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function transferOwnership() {
    if (!(await ensureCorrectNetwork())) return;
    if (!ethers.isAddress(newOwnerAddress)) {
      toast.warning("Please enter a valid owner address");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: poolType === "Contriboost" ? ContriboostAbi : GoalFundAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "transferOwnership",
        params: [newOwnerAddress],
        gas: 200000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Transfer ownership tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Ownership transferred successfully!`);
      setNewOwnerAddress("");
    } catch (error) {
      console.error("Error transferring ownership:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to transfer ownership"}`);
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
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: ContriboostAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "exitContriboost",
        params: [],
        gas: 200000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Exit Contriboost tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Successfully exited the Contriboost pool!`);
    } catch (error) {
      console.error("Error exiting Contriboost:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to exit"}`);
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
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: GoalFundAbi,
      });

      const amount = ethers.parseEther(contributeAmount);

      if (poolDetails.tokenAddress === ethers.ZeroAddress) {
        const balance = await provider.getBalance(account);
        if (balance < amount) {
          throw new Error(`Insufficient CELO balance: ${ethers.formatEther(balance)} available`);
        }
      } else {
        const tokenContract = new ethers.Contract(poolDetails.tokenAddress, IERC20Abi, signer);
        const tokenBalance = await tokenContract.balanceOf(account);
        if (tokenBalance < amount) {
          throw new Error(`Insufficient cUSD balance: ${ethers.formatEther(tokenBalance)} available`);
        }
        const allowance = await tokenContract.allowance(account, contractAddress);
        if (allowance < amount) {
          console.log(`Approving cUSD allowance...`);
          const approveTx = await tokenContract.approve(contractAddress, amount, { gasLimit: 100000 });
          await approveTx.wait();
        }
      }

      const transaction = await prepareContractCall({
        contract,
        method: "contribute",
        params: [amount],
        value: poolDetails.tokenAddress === ethers.ZeroAddress ? amount : 0n,
        gas: 300000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Contribute GoalFund tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Contribution successful!`);
      setContributeAmount("");
    } catch (error) {
      console.error("Error contributing to GoalFund:", error);
      toast.error(`Error: ${error.message || "Failed to contribute"}`);
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
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: GoalFundAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "withdrawFunds",
        params: [],
        gas: 300000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Withdraw GoalFund tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Funds withdrawn successfully!`);
    } catch (error) {
      console.error("Error withdrawing funds:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to withdraw funds"}`);
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
      const contract = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: contractAddress,
        abi: GoalFundAbi,
      });

      const transaction = await prepareContractCall({
        contract,
        method: "refundContributors",
        params: [],
        gas: 500000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Refund contributors tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Refunds issued successfully!`);
    } catch (error) {
      console.error("Error issuing refunds:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to issue refunds"}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function transferRewards() {
    if (!(await ensureCorrectNetwork())) return;
    if (!isFactoryOwner && !userStatus?.isOwner) {
      toast.warning("Only the factory owner or pool owner can transfer rewards");
      return;
    }
    if (!ethers.isAddress(rewardTransferAddress)) {
      toast.warning("Please enter a valid contributor address");
      return;
    }
    if (!rewardTransferAmount || isNaN(rewardTransferAmount) || Number(rewardTransferAmount) <= 0) {
      toast.warning("Please enter a valid reward amount");
      return;
    }

    setIsProcessing(true);
    try {
      const goalFundFactory = getContract({
        client: thirdwebClient,
        chain: celoAlfajores,
        address: NETWORKS.celo.goalFundFactory,
        abi: GoalFundFactoryAbi,
      });

      const amount = ethers.parseEther(rewardTransferAmount);

      const goodDollarTokenAddress = await goalFundFactory.read({ method: "goodDollarToken", params: [] });
      const tokenContract = new ethers.Contract(goodDollarTokenAddress, IERC20Abi, signer);
      const balance = await tokenContract.balanceOf(account);
      if (balance < amount) {
        throw new Error(`Insufficient GoodDollar balance: ${ethers.formatEther(balance)} available`);
      }

      const allowance = await tokenContract.allowance(account, NETWORKS.celo.goalFundFactory);
      if (allowance < amount) {
        const approveTx = await tokenContract.approve(NETWORKS.celo.goalFundFactory, amount, { gasLimit: 100000 });
        await approveTx.wait();
      }

      const transaction = await prepareContractCall({
        contract: goalFundFactory,
        method: "transferRewards",
        params: [contractAddress, rewardTransferAddress, amount],
        gas: 300000n,
      });

      const receipt = await sendTransaction({
        transaction,
        account: signer,
      });

      console.log("Transfer rewards tx hash:", receipt.transactionHash);
      await fetchPoolDetails();
      toast.success(`Rewards transferred successfully to ${formatAddress(rewardTransferAddress)}!`);
      setRewardTransferAmount("");
      setRewardTransferAddress("");
    } catch (error) {
      console.error("Error transferring rewards:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to transfer rewards"}`);
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
        <span>Loading pool detailsals...</span>
      </div>
    );
  }

  if (error || !poolDetails) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Pool not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isCorrectNetwork = chainId === NETWORKS.celo.chainId;
  const isContriboost = poolType === "Contriboost";
  const canJoin =
    isContriboost &&
    !userStatus?.isParticipant &&
    poolDetails.status !== "full" &&
    poolDetails.status !== "completed" &&
    poolDetails.currentParticipants < poolDetails.expectedNumber;
  const canDeposit =
    isContriboost &&
    userStatus?.isParticipant &&
    userStatus?.isActive &&
    poolDetails.status === "active";
  const canExit =
    isContriboost && userStatus?.isParticipant && poolDetails.status === "not-started";
  const canContribute = !isContriboost && poolDetails.status === "active" && !poolDetails.achieved;
  const canWithdraw =
    !isContriboost &&
    (userStatus?.isBeneficiary || userStatus?.isOwner) &&
    poolDetails.currentAmount > 0 &&
    !poolDetails.fundsWithdrawn;
  const canRefund = !isContriboost && userStatus?.isOwner && !poolDetails.achieved;
  const canManage =
    (isContriboost && userStatus?.isHost) ||
    (!isContriboost && userStatus?.isOwner) ||
    isFactoryOwner;
  const progress = isContriboost
    ? (poolDetails.currentSegment / poolDetails.expectedNumber) * 100
    : (parseFloat(poolDetails.currentAmount) / parseFloat(poolDetails.targetAmount)) * 100;

  function AdminActionsDialog() {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button disabled={isConnecting || !canManage} className="min-w-[120px]">
            Admin Actions
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px] bg-[#101b31]">
          <DialogHeader>
            <DialogTitle>Admin Actions</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {isContriboost && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="newDescription">Update Description</Label>
                  <Input
                    id="newDescription"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Enter new description"
                  />
                  <Button
                    onClick={isCorrectNetwork ? setDescription : () => switchNetwork(NETWORKS.celo.chainId)}
                    disabled={isProcessing || !isCorrectNetwork || !newDescription}
                    className="w-full"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {isCorrectNetwork ? "Update Description" : `Switch to ${NETWORKS.celo.name}`}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newHostFee">Update Host Fee (%)</Label>
                  <Input
                    id="newHostFee"
                    type="number"
                    value={newHostFee}
                    onChange={(e) => setNewHostFee(e.target.value)}
                    placeholder="Enter new host fee percentage"
                  />
                  <Button
                    onClick={isCorrectNetwork ? setHostFeePercentage : () => switchNetwork(NETWORKS.celo.chainId)}
                    disabled={isProcessing || !isCorrectNetwork || !newHostFee}
                    className="w-full"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {isCorrectNetwork ? "Update Host Fee" : `Switch to ${NETWORKS.celo.name}`}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newTokenAddress">Update Token Address</Label>
                  <Input
                    id="newTokenAddress"
                    value={newTokenAddress}
                    onChange={(e) => setNewTokenAddress(e.target.value)}
                    placeholder="Enter new token address"
                  />
                  <Button
                    onClick={isCorrectNetwork ? setTokenAddress : () => switchNetwork(NETWORKS.celo.chainId)}
                    disabled={isProcessing || !isCorrectNetwork || !ethers.isAddress(newTokenAddress)}
                    className="w-full"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {isCorrectNetwork ? "Update Token" : `Switch to ${NETWORKS.celo.name}`}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newOwnerAddress">Transfer Ownership</Label>
                  <Input
                    id="newOwnerAddress"
                    value={newOwnerAddress}
                    onChange={(e) => setNewOwnerAddress(e.target.value)}
                    placeholder="Enter new owner address"
                  />
                  <Button
                    onClick={isCorrectNetwork ? transferOwnership : () => switchNetwork(NETWORKS.celo.chainId)}
                    disabled={isProcessing || !isCorrectNetwork || !ethers.isAddress(newOwnerAddress)}
                    className="w-full"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {isCorrectNetwork ? "Transfer Ownership" : `Switch to ${NETWORKS.celo.name}`}
                  </Button>
                </div>
                <Button
                  onClick={isCorrectNetwork ? distributeContriboostFunds : () => switchNetwork(NETWORKS.celo.chainId)}
                  disabled={isProcessing || !isCorrectNetwork}
                  className="w-full"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isCorrectNetwork ? "Distribute Funds" : `Switch to ${NETWORKS.celo.name}`}
                </Button>
              </>
            )}
            {!isContriboost && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="newOwnerAddress">Transfer Ownership</Label>
                  <Input
                    id="newOwnerAddress"
                    value={newOwnerAddress}
                    onChange={(e) => setNewOwnerAddress(e.target.value)}
                    placeholder="Enter new owner address"
                  />
                  <Button
                    onClick={isCorrectNetwork ? transferOwnership : () => switchNetwork(NETWORKS.celo.chainId)}
                    disabled={isProcessing || !isCorrectNetwork || !ethers.isAddress(newOwnerAddress)}
                    className="w-full"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {isCorrectNetwork ? "Transfer Ownership" : `Switch to ${NETWORKS.celo.name}`}
                  </Button>
                </div>
                {(isFactoryOwner || userStatus?.isOwner) && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="rewardTransferAddress">Transfer Rewards To</Label>
                      <Input
                        id="rewardTransferAddress"
                        value={rewardTransferAddress}
                        onChange={(e) => setRewardTransferAddress(e.target.value)}
                        placeholder="Enter contributor address"
                      />
                      <Label htmlFor="rewardTransferAmount">Reward Amount (G$)</Label>
                      <Input
                        id="rewardTransferAmount"
                        type="number"
                        step="0.000000000000000001"
                        min="0"
                        value={rewardTransferAmount}
                        onChange={(e) => setRewardTransferAmount(e.target.value)}
                        placeholder="Enter reward amount"
                      />
                      <Button
                        onClick={isCorrectNetwork ? transferRewards : () => switchNetwork(NETWORKS.celo.chainId)}
                        disabled={
                          isProcessing ||
                          !isCorrectNetwork ||
                          !ethers.isAddress(rewardTransferAddress) ||
                          !rewardTransferAmount
                        }
                        className="w-full"
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {isCorrectNetwork ? "Transfer Rewards" : `Switch to ${NETWORKS.celo.name}`}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
            <Button
              onClick={() =>
                isCorrectNetwork
                  ? emergencyWithdraw(poolDetails.tokenAddress)
                  : switchNetwork(NETWORKS.celo.chainId)
              }
              disabled={isProcessing || !isCorrectNetwork}
              variant="destructive"
              className="w-full"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isCorrectNetwork ? "Emergency Withdraw" : `Switch to ${NETWORKS.celo.name}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">{poolDetails.name}</h1>
          <p className="text-muted-foreground">
            {isContriboost ? "Contriboost Pool" : `GoalFund - ${poolDetails.fundType === 0 ? "Grouped" : "Personal"}`}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && <AdminActionsDialog />}
          <Button variant="outline" onClick={() => router.push("/pools")}>
            Back to Pools
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pool Details</CardTitle>
              <CardDescription>
                {isContriboost ? "Rotating savings pool details" : "Goal-based funding campaign details"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span>{NETWORKS[network].name}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Contract Address: </span>
                  <span className="font-mono">{formatAddress(poolDetails.contractAddress)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Description: </span>
                  <span>{poolDetails.description}</span>
                </div>
                {isContriboost ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Contribution Amount</span>
                      <span className="font-medium">
                        {parseFloat(poolDetails.contributionAmount).toFixed(4)} {poolDetails.tokenSymbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Participants</span>
                      <span className="font-medium">
                        {poolDetails.currentParticipants}/{poolDetails.expectedNumber}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current Segment</span>
                      <span className="font-medium">
                        {poolDetails.currentSegment}/{poolDetails.expectedNumber}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cycle Duration</span>
                      <span className="font-medium">{poolDetails.dayRange} days</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Host Fee</span>
                      <span className="font-medium">{poolDetails.hostFeePercentage / 100}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="font-medium">{poolDetails.platformFeePercentage / 100}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Max Missed Deposits</span>
                      <span className="font-medium">{poolDetails.maxMissedDeposits}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Start Date</span>
                      <span className="font-medium">{formatDate(poolDetails.startTimestamp)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Host</span>
                      <span className="font-medium font-mono">{formatAddress(poolDetails.host)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Target Amount</span>
                      <span className="font-medium">
                        {parseFloat(poolDetails.targetAmount).toFixed(4)} {poolDetails.tokenSymbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current Amount</span>
                      <span className="font-medium">
                        {parseFloat(poolDetails.currentAmount).toFixed(4)} {poolDetails.tokenSymbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Deadline</span>
                      <span className="font-medium">{formatDate(poolDetails.deadline)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Beneficiary</span>
                      <span className="font-medium font-mono">{formatAddress(poolDetails.beneficiary)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Contributors</span>
                      <span className="font-medium">{poolDetails.contributors}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="font-medium">{poolDetails.platformFeePercentage / 100}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Your Contribution</span>
                      <span className="font-medium">
                        {userStatus?.hasContributed
                          ? `${parseFloat(userStatus.userContribution).toFixed(4)} ${poolDetails.tokenSymbol}`
                          : "0"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Your Accumulated Rewards</span>
                      <span className="font-medium">
                        {parseFloat(accumulatedRewards).toFixed(4)} G$
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={`font-medium ${
                      poolDetails.status === "active"
                        ? "text-green-600"
                        : poolDetails.status === "full"
                        ? "text-amber-600"
                        : poolDetails.status === "not-started"
                        ? "text-blue-600"
                        : poolDetails.status === "completed"
                        ? "text-gray-600"
                        : poolDetails.status === "achieved"
                        ? "text-teal-600"
                        : "text-red-600"
                    }`}
                  >
                    {poolDetails.status === "active"
                      ? "Active"
                      : poolDetails.status === "full"
                      ? "Full"
                      : poolDetails.status === "not-started"
                      ? "Not Started"
                      : poolDetails.status === "completed"
                      ? "Completed"
                      : poolDetails.status === "achieved"
                      ? "Achieved"
                      : "Expired"}
                  </span>
                </div>
              </div>
              <div className="mt-4">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground mt-2">
                  {isContriboost
                    ? `${poolDetails.currentSegment} of ${poolDetails.expectedNumber} segments completed`
                    : `${parseFloat(poolDetails.currentAmount).toFixed(2)} / ${parseFloat(
                        poolDetails.targetAmount
                      ).toFixed(2)} ${poolDetails.tokenSymbol} raised`}
                </p>
              </div>
            </CardContent>
          </Card>

          {isContriboost && (
            <Card>
              <CardHeader>
                <CardTitle>Participants</CardTitle>
                <CardDescription>List of all participants in this pool</CardDescription>
              </CardHeader>
              <CardContent>
                {participants.length === 0 ? (
                  <p className="text-muted-foreground">No participants yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Participant</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Deposits</TableHead>
                        <TableHead>Missed</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {participants.map((participant) => (
                        <TableRow key={participant.address}>
                          <TableCell className="font-mono">{formatAddress(participant.address)}</TableCell>
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
                            {userStatus?.isHost &&
                              !participant.active &&
                              !participant.receivedFunds &&
                              poolDetails.status === "active" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => reactivateContriboost(participant.address)}
                                  disabled={isProcessing}
                                >
                                  {isProcessing ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : null}
                                  Reactivate
                                </Button>
                              )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {isContriboost ? (
            <>
              {canJoin && (
                <Card>
                  <CardHeader>
                    <CardTitle>Join Pool</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      onClick={isCorrectNetwork ? joinContriboost : () => switchNetwork(NETWORKS.celo.chainId)}
                      disabled={isProcessing || !isCorrectNetwork}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {isCorrectNetwork ? "Join Pool" : `Switch to ${NETWORKS.celo.name}`}
                    </Button>
                  </CardContent>
                </Card>
              )}
              {canDeposit && (
                <Card>
                  <CardHeader>
                    <CardTitle>Deposit</CardTitle>
                    <CardDescription>
                      Deposit {poolDetails.contributionAmount} {poolDetails.tokenSymbol} for the current segment
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Input
                        type="number"
                        step="0.000000000000000001"
                        min="0"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder={`Enter amount (${poolDetails.contributionAmount} ${poolDetails.tokenSymbol})`}
                      />
                      <Button
                        className="w-full"
                        onClick={isCorrectNetwork ? depositContriboost : () => switchNetwork(NETWORKS.celo.chainId)}
                        disabled={isProcessing || !isCorrectNetwork}
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {isCorrectNetwork ? "Deposit" : `Switch to ${NETWORKS.celo.name}`}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {canExit && (
                <Card>
                  <CardHeader>
                    <CardTitle>Exit Pool</CardTitle>
                    <CardDescription>Exit the pool before it starts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      variant="destructive"
                      onClick={isCorrectNetwork ? exitContriboost : () => switchNetwork(NETWORKS.celo.chainId)}
                      disabled={isProcessing || !isCorrectNetwork}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {isCorrectNetwork ? "Exit Pool" : `Switch to ${NETWORKS.celo.name}`}
                    </Button>
                  </CardContent>
                </Card>
              )}
              {userStatus?.isHost && (
                <Card>
                  <CardHeader>
                    <CardTitle>Check Missed Deposits</CardTitle>
                    <CardDescription>Check and penalize missed deposits</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      onClick={isCorrectNetwork ? checkMissedDeposits : () => switchNetwork(NETWORKS.celo.chainId)}
                      disabled={isProcessing || !isCorrectNetwork}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {isCorrectNetwork ? "Check Missed Deposits" : `Switch to ${NETWORKS.celo.name}`}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <>
              {canContribute && (
                <Card>
                  <CardHeader>
                    <CardTitle>Contribute</CardTitle>
                    <CardDescription>Contribute to the funding goal</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Input
                        type="number"
                        step="0.000000000000000001"
                        min="0"
                        value={contributeAmount}
                        onChange={(e) => setContributeAmount(e.target.value)}
                        placeholder={`Enter amount (${poolDetails.tokenSymbol})`}
                      />
                      <Button
                        className="w-full"
                        onClick={isCorrectNetwork ? contributeGoalFund : () => switchNetwork(NETWORKS.celo.chainId)}
                        disabled={isProcessing || !isCorrectNetwork}
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {isCorrectNetwork ? "Contribute" : `Switch to ${NETWORKS.celo.name}`}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {canWithdraw && (
                <Card>
                  <CardHeader>
                    <CardTitle>Withdraw Funds</CardTitle>
                    <CardDescription>Withdraw funds as the beneficiary or owner</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      onClick={isCorrectNetwork ? withdrawGoalFund : () => switchNetwork(NETWORKS.celo.chainId)}
                      disabled={isProcessing || !isCorrectNetwork}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {isCorrectNetwork ? "Withdraw Funds" : `Switch to ${NETWORKS.celo.name}`}
                    </Button>
                  </CardContent>
                </Card>
              )}
              {canRefund && (
                <Card>
                  <CardHeader>
                    <CardTitle>Refund Contributors</CardTitle>
                    <CardDescription>Issue refunds to all contributors</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      variant="destructive"
                      onClick={isCorrectNetwork ? refundContributors : () => switchNetwork(NETWORKS.celo.chainId)}
                      disabled={isProcessing || !isCorrectNetwork}
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {isCorrectNetwork ? "Refund Contributors" : `Switch to ${NETWORKS.celo.name}`}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}