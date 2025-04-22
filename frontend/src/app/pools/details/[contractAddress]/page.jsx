"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { Loader2, AlertCircle, DollarSign, Calendar, Users, Tag } from "lucide-react";
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

const CONTRIBOOST_FACTORY_ADDRESS = "0x8d91FA63710cF0Ed4D2DB5b2373F4b27dFcC2B90";
const GOALFUND_FACTORY_ADDRESS = "0x0FCC04f5D3563ABf0A6709427d5165A984C1318F";
const USDT_ADDRESS = "0x2728DD8B45B788e26d12B13Db5A244e5403e7eda";

export default function PoolDetailsPage() {
  const { contractAddress } = useParams();
  const router = useRouter();
  const { provider, signer, account, connect, isConnecting } = useWeb3();
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

  useEffect(() => {
    if (!contractAddress || typeof contractAddress !== "string") {
      setError("No contract address provided");
      setIsLoading(false);
      router.push("/pools");
      return;
    }
    if (!provider) {
      setError("Web3 provider not connected");
      setIsLoading(false);
      return;
    }
    if (ethers.isAddress(contractAddress)) {
      fetchPoolDetails();
    } else {
      setError("Invalid contract address");
      setIsLoading(false);
    }
  }, [provider, contractAddress, router, account]);

  async function fetchPoolDetails() {
    console.log("Fetching details for contract:", contractAddress);
    setIsLoading(true);
    setError(null);

    try {
      const contriboostFactory = new ethers.Contract(
        CONTRIBOOST_FACTORY_ADDRESS,
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
          account ? contract.getParticipantStatus(account) : null,
        ]);

        // Fetch participant details
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

        const status =
          Math.floor(Date.now() / 1000) < startTimestamp
            ? "not-started"
            : activeParticipants.length >= Number(contriboostDetails.expectedNumber)
            ? "full"
            : Number(currentSegment) > 0
            ? "active"
            : "not-started";

        setPoolType("Contriboost");
        setPoolDetails({
          contractAddress: contriboostDetails.contractAddress,
          name: contriboostDetails.name,
          description: description || "No description provided",
          dayRange: Number(contriboostDetails.dayRange),
          expectedNumber: Number(contriboostDetails.expectedNumber),
          contributionAmount: ethers.formatEther(contriboostDetails.contributionAmount),
          tokenAddress: contriboostDetails.tokenAddress,
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
          account
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
        GOALFUND_FACTORY_ADDRESS,
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
          account ? contract.contributions(account) : 0,
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
          fundType: Number(goalFundDetails.fundType),
          platformFeePercentage: Number(goalFundDetails.platformFeePercentage),
          contributors: Number(contributorCount),
          status,
          userContribution: ethers.formatEther(userContribution),
          achieved: goalFundDetails.achieved,
          fundsWithdrawn: goal.fundsWithdrawn,
        });
        setUserStatus(
          account
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

  async function joinContriboost() {
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.error("Please connect your wallet");
        return;
      }
    }
    if (!userStatus || userStatus.isParticipant) {
      toast.error("You are already a participant or cannot join");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.join({ gasLimit: 200000 });
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Successfully joined the Contriboost pool!");
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
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
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
            `Insufficient ETH balance: ${ethers.formatEther(balance)} ETH available`
          );
        }
        tx = await contract.deposit({ value: amount, gasLimit: 300000 });
      } else if (poolDetails.tokenAddress.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
        const tokenContract = new ethers.Contract(USDT_ADDRESS, IERC20Abi, signer);
        const tokenBalance = await tokenContract.balanceOf(account);
        if (tokenBalance < amount) {
          throw new Error(
            `Insufficient USDT balance: ${ethers.formatEther(tokenBalance)} USDT available`
          );
        }
        const allowance = await tokenContract.allowance(account, contractAddress);
        if (allowance < amount) {
          console.log("Approving USDT allowance...");
          const approveTx = await tokenContract.approve(contractAddress, amount, {
            gasLimit: 100000,
          });
          await approveTx.wait();
        }
        tx = await contract.deposit({ gasLimit: 300000 });
      } else {
        throw new Error("Unsupported token address");
      }

      await tx.wait();
      await fetchPoolDetails();
      toast.success("Deposit successful!");
      setDepositAmount("");
    } catch (error) {
      console.error("Error depositing to Contriboost:", error);
      let message = "Failed to deposit";
      if (error.message.includes("insufficient funds")) {
        message = "Insufficient funds for deposit and gas fees";
      } else if (error.message.includes("Insufficient ETH balance")) {
        message = error.message;
      } else if (error.message.includes("Insufficient USDT balance")) {
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
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.checkMissedDeposits({ gasLimit: 200000 });
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Missed deposits checked successfully!");
    } catch (error) {
      console.error("Error checking missed deposits:", error);
      let message = error.reason || error.message || "Failed to check missed deposits";
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function emergencyWithdraw(tokenAddress) {
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
    if (!userStatus?.isHost && !userStatus?.isOwner) {
      toast.warning("Only the host or owner can perform emergency withdrawal");
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
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Emergency withdrawal successful!");
    } catch (error) {
      console.error("Error performing emergency withdrawal:", error);
      let message = error.reason || error.message || "Failed to perform emergency withdrawal";
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function setDescription() {
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
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
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Description updated successfully!");
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
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
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
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Host fee updated successfully!");
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
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
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
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Token address updated successfully!");
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
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
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
      await tx.wait();
      await fetchPoolDetails();
      toast.success(`Successfully reactivated participant ${formatAddress(participantAddress)}!`);
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
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
    if (!userStatus?.isHost) {
      toast.warning("Only the host can distribute funds");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      const tx = await contract.distributeFunds({ gasLimit: 500000 });
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Funds distributed successfully!");
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
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
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
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Ownership transferred successfully!");
      setNewOwnerAddress("");
    } catch (error) {
      console.error("Error transferring ownership:", error);
      let message = error.reason || error.message || "Failed to transfer ownership";
      toast.error(`Error: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function contributeGoalFund() {
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
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
            `Insufficient ETH balance: ${ethers.formatEther(balance)} ETH available`
          );
        }
        tx = await contract.contribute({ value: amount, gasLimit: 300000 });
      } else if (poolDetails.tokenAddress.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
        const tokenContract = new ethers.Contract(USDT_ADDRESS, IERC20Abi, signer);
        const tokenBalance = await tokenContract.balanceOf(account);
        if (tokenBalance < amount) {
          throw new Error(
            `Insufficient USDT balance: ${ethers.formatEther(tokenBalance)} USDT available`
          );
        }
        const allowance = await tokenContract.allowance(account, contractAddress);
        if (allowance < amount) {
          console.log("Approving USDT allowance...");
          const approveTx = await tokenContract.approve(contractAddress, amount, {
            gasLimit: 100000,
          });
          await approveTx.wait();
        }
        tx = await contract.contribute(amount, { gasLimit: 300000 });
      } else {
        throw new Error("Unsupported token address");
      }

      await tx.wait();
      await fetchPoolDetails();
      toast.success("Contribution successful!");
      setContributeAmount("");
    } catch (error) {
      console.error("Error contributing to GoalFund:", error);
      let message = "Failed to contribute";
      if (error.message.includes("insufficient funds")) {
        message = "Insufficient funds for contribution and gas fees";
      } else if (error.message.includes("Insufficient ETH balance")) {
        message = error.message;
      } else if (error.message.includes("Insufficient USDT balance")) {
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
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
    if (!userStatus?.isBeneficiary && !userStatus?.isOwner) {
      toast.warning("Only the beneficiary or owner can withdraw funds");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, GoalFundAbi, signer);
      const tx = await contract.withdrawFunds({ gasLimit: 300000 });
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Funds withdrawn successfully!");
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
    if (!signer || !account) {
      await connect();
      if (!account) {
        toast.warning("Please connect your wallet");
        return;
      }
    }
    if (!userStatus?.isOwner) {
      toast.warning("Only the owner can issue refunds");
      return;
    }
    setIsProcessing(true);
    try {
      const contract = new ethers.Contract(contractAddress, GoalFundAbi, signer);
      const tx = await contract.refundContributors({ gasLimit: 500000 });
      await tx.wait();
      await fetchPoolDetails();
      toast.success("Refunds issued successfully!");
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

  if (error || !poolDetails) {
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
  const isETH = poolDetails.tokenAddress === ethers.ZeroAddress;
  const canJoinContriboost =
    isContriboost &&
    userStatus &&
    !userStatus.isParticipant &&
    poolDetails.status !== "full" &&
    poolDetails.currentParticipants < poolDetails.expectedNumber;
  const canDepositContriboost =
    isContriboost &&
    userStatus &&
    userStatus.isParticipant &&
    userStatus.isActive &&
    !userStatus.hasReceivedFunds &&
    poolDetails.status === "active";
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
  const canDistributeContriboost =
    isContriboost &&
    userStatus &&
    userStatus.isHost &&
    poolDetails.status === "active";
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
                Your contribution: {poolDetails.userContribution} {isETH ? "ETH" : "USDT"}
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
                  ? `${poolDetails.contributionAmount} ${isETH ? "ETH" : "USDT"}`
                  : `${poolDetails.currentAmount}/${poolDetails.targetAmount} ${isETH ? "ETH" : "USDT"}`}
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
              onClick={joinContriboost}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Join
            </Button>
          </div>
        )}
        {canDepositContriboost && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="depositAmount">Deposit Amount ({isETH ? "ETH" : "USDT"})</Label>
              <Input
                id="depositAmount"
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder={`Min: ${poolDetails.contributionAmount}`}
                className="w-48"
              />
            </div>
            <Button
              onClick={depositContriboost}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Deposit
            </Button>
          </div>
        )}
        {canContributeGoalFund && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="contributeAmount">Contribution Amount ({isETH ? "ETH" : "USDT"})</Label>
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
              onClick={contributeGoalFund}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Contribute
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {canCheckMissedDeposits && (
            <Button
              onClick={checkMissedDeposits}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Check Missed Deposits
            </Button>
          )}
          {canEmergencyWithdraw && (
            <Button
              onClick={() => emergencyWithdraw(poolDetails.tokenAddress)}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Emergency Withdraw
            </Button>
          )}
          {canDistributeContriboost && (
            <Button
              onClick={distributeContriboostFunds}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Distribute Funds
            </Button>
          )}
          {canWithdrawGoalFund && (
            <Button
              onClick={withdrawGoalFund}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Withdraw Funds
            </Button>
          )}
          {canRefundGoalFund && (
            <Button
              onClick={refundContributors}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Refund Contributors
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
              onClick={setDescription}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Set Description
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
              onClick={setHostFeePercentage}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Set Host Fee
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
              onClick={setTokenAddress}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Set Token Address
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
              onClick={transferOwnership}
              disabled={isProcessing || isConnecting}
              className="min-w-[120px]"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Transfer Ownership
            </Button>
          </div>
        )}
      </div>

      {isContriboost && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Participants</CardTitle>
            <CardDescription>List of all participants and their status</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Deposit Amount</TableHead>
                  <TableHead>Last Deposit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Missed Deposits</TableHead>
                  {userStatus?.isHost && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.map((participant) => (
                  <TableRow key={participant.address}>
                    <TableCell>{formatAddress(participant.address)}</TableCell>
                    <TableCell>{participant.id}</TableCell>
                    <TableCell>{participant.depositAmount} {isETH ? "ETH" : "USDT"}</TableCell>
                    <TableCell>
                      {participant.lastDepositTime
                        ? formatDate(participant.lastDepositTime)
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      {participant.active ? "Active" : "Inactive"}
                      {participant.receivedFunds && " (Received Funds)"}
                    </TableCell>
                    <TableCell>{participant.missedDeposits}</TableCell>
                    {userStatus?.isHost && (
                      <TableCell>
                        {!participant.active &&
                          participant.missedDeposits < poolDetails.maxMissedDeposits && (
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
                <TableCell className="font-medium">Token Address</TableCell>
                <TableCell>
                  {isETH ? "Native ETH" : formatAddress(poolDetails.tokenAddress)}
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
                      {poolDetails.targetAmount} {isETH ? "ETH" : "USDT"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Current Amount</TableCell>
                    <TableCell>
                      {poolDetails.currentAmount} {isETH ? "ETH" : "USDT"}
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