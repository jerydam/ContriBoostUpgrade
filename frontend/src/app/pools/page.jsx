"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import {
  ContriboostFactoryAbi,
  ContriboostAbi,
  GoalFundFactoryAbi,
  GoalFundAbi,
} from "@/lib/contractabi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Search, Users, Wallet, Coins, ChevronRight, Tag, Globe } from "lucide-react";
import { toast } from "react-toastify";

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

export default function PoolsPage() {
  const { provider, signer, account, chainId, connect, isConnecting, switchNetwork } = useWeb3();
  const [pools, setPools] = useState([]);
  const [filteredPools, setFilteredPools] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [fetchErrors, setFetchErrors] = useState([]);
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  const [rewardFundingAmount, setRewardFundingAmount] = useState("");
  const [isFactoryOwner, setIsFactoryOwner] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);

  useEffect(() => {
    const created = searchParams.get("created");
    if (created === "true") {
      toast.success("Pool created successfully!");
      fetchPools();
    } else {
      fetchPools();
    }
    checkFactoryOwner();
  }, [searchParams, account, chainId]);

  useEffect(() => {
    filterPools();
  }, [pools, searchQuery, statusFilter]);

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

  async function fetchPools() {
    setIsLoading(true);
    setFetchErrors([]);
    const allPools = [];

    try {
      const celoContriboostPools = await fetchContriboostPools("celo", celoProvider);
      allPools.push(...celoContriboostPools);
    } catch (error) {
      console.error("Error fetching Celo Alfajores Contriboost pools:", error);
      setFetchErrors((prev) => [...prev, `Celo Alfajores Contriboost: ${error.message}`]);
    }

    try {
      const celoGoalFundPools = await fetchGoalFundPools("celo", celoProvider);
      allPools.push(...celoGoalFundPools);
    } catch (error) {
      console.error("Error fetching Celo Alfajores GoalFund pools:", error);
      setFetchErrors((prev) => [...prev, `Celo Alfajores GoalFund: ${error.message}`]);
    }

    const seen = new Set();
    const deduplicatedPools = allPools
      .filter((pool) => {
        if (!pool || !pool.contractAddress || !ethers.isAddress(pool.contractAddress)) {
          console.warn(`Invalid pool address detected:`, pool);
          return false;
        }
        const key = `${pool.contractAddress}-${pool.network}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const timeA = a.type === "Contriboost" ? a.startTimestamp : a.deadline;
        const timeB = b.type === "Contriboost" ? b.startTimestamp : b.deadline;
        return timeB - timeA;
      });

    setPools(deduplicatedPools);
    setIsLoading(false);

    if (fetchErrors.length > 0) {
      toast.error("Some pools failed to load.");
    } else if (deduplicatedPools.length === 0) {
      toast.warn("No valid pools found.");
    }
  }

  async function fetchContriboostPools(network, provider) {
    const config = NETWORKS[network];
    const contriboostFactory = new ethers.Contract(config.contriboostFactory, ContriboostFactoryAbi, provider);

    let contriboostAddresses = [];
    try {
      contriboostAddresses = await contriboostFactory.getContriboosts();
    } catch (error) {
      console.error(`Failed to fetch Contriboost addresses for ${config.name}:`, error);
      return [];
    }

    const contriboostDetails = await Promise.all(
      contriboostAddresses.map(async (address) => {
        if (!ethers.isAddress(address)) return null;
        try {
          const detailsArray = await contriboostFactory.getContriboostDetails(address, false);
          if (!detailsArray || !detailsArray[0]) return null;
          const details = detailsArray[0];

          const contract = new ethers.Contract(address, ContriboostAbi, provider);
          let participants = [];
          let currentSegment = 0;
          let startTimestamp = 0;
          let expectedNumber = Number(details.expectedNumber || 0);
          try {
            participants = await contract.getActiveParticipants();
            currentSegment = await contract.currentSegment();
            startTimestamp = Number(await contract.startTimestamp());
          } catch (err) {
            console.warn(`Failed to fetch additional data for Contriboost at ${address}:`, err);
          }

          const now = Math.floor(Date.now() / 1000);
          let status = "not-started";
          if (now < startTimestamp) {
            status = "not-started";
          } else if (currentSegment > expectedNumber) {
            status = "completed";
          } else if (participants.length >= expectedNumber && currentSegment > 0) {
            status = "active";
          } else if (currentSegment > 0) {
            status = "active";
          } else if (participants.length >= expectedNumber) {
            status = "full";
          }

          let userStatus = { isParticipant: false, isActive: false, hasReceivedFunds: false, missedDeposits: 0 };
          if (account && chainId === config.chainId) {
            try {
              const participantStatus = await contract.getParticipantStatus(account);
              userStatus = {
                isParticipant: participantStatus.exists,
                isActive: participantStatus.active,
                hasReceivedFunds: participantStatus.receivedFunds,
                missedDeposits: Number(participantStatus.missedDeposits),
              };
            } catch (err) {
              console.warn(`Failed to fetch participant status for ${address}:`, err);
            }
          }

          return {
            type: "Contriboost",
            network,
            chainId: config.chainId,
            contractAddress: details.contractAddress,
            name: details.name || "Unnamed Pool",
            dayRange: Number(details.dayRange || 0),
            expectedNumber,
            contributionAmount: ethers.formatEther(details.contributionAmount || 0n),
            tokenAddress: details.tokenAddress || ethers.ZeroAddress,
            tokenSymbol: details.tokenAddress === ethers.ZeroAddress ? config.nativeSymbol : config.tokenSymbol,
            hostFeePercentage: Number(details.hostFeePercentage || 0),
            platformFeePercentage: Number(details.platformFeePercentage || 0),
            maxMissedDeposits: Number(details.maxMissedDeposits || 0),
            currentParticipants: participants.length,
            currentSegment: Number(currentSegment),
            startTimestamp,
            status,
            userStatus,
          };
        } catch (err) {
          console.error(`Error processing Contriboost at ${address}:`, err);
          return null;
        }
      })
    );

    return contriboostDetails.filter((pool) => pool !== null);
  }

  async function fetchGoalFundPools(network, provider) {
    const config = NETWORKS[network];
    const goalFundFactory = new ethers.Contract(config.goalFundFactory, GoalFundFactoryAbi, provider);

    let goalFundDetailsRaw = [];
    try {
      goalFundDetailsRaw = await goalFundFactory.getAllGoalFundsDetails();
    } catch (error) {
      console.error(`Failed to fetch GoalFund details for ${config.name}:`, error);
      return [];
    }

    return Promise.all(
      goalFundDetailsRaw.map(async (pool) => {
        if (!pool || !ethers.isAddress(pool.contractAddress)) return null;
        try {
          if (pool.fundType === 1) return null; // Skip personal GoalFunds

          const contract = new ethers.Contract(pool.contractAddress, GoalFundAbi, provider);
          let goal = { achieved: false };
          let accumulatedRewards = "0";
          try {
            goal = await contract.goal();
            if (account && chainId === config.chainId) {
              accumulatedRewards = ethers.formatEther(await contract.getAccumulatedRewards(account));
            }
          } catch (err) {
            console.warn(`Failed to fetch goal or rewards for GoalFund at ${pool.contractAddress}:`, err);
          }

          const now = Math.floor(Date.now() / 1000);
          let status = "active";
          if (now > Number(pool.deadline)) {
            status = goal.achieved ? "achieved" : "expired";
          } else if (goal.achieved) {
            status = "achieved";
          }

          let userStatus = { isParticipant: false, contributionAmount: "0", accumulatedRewards };
          if (account && chainId === config.chainId) {
            try {
              const contribution = await contract.contributions(account);
              userStatus = {
                isParticipant: contribution > 0,
                contributionAmount: ethers.formatEther(contribution),
                accumulatedRewards,
              };
            } catch (err) {
              console.warn(`Failed to fetch contribution for ${pool.contractAddress}:`, err);
            }
          }

          return {
            type: "GoalFund",
            network,
            chainId: config.chainId,
            contractAddress: pool.contractAddress,
            name: pool.name || "Unnamed Fund",
            targetAmount: ethers.formatEther(pool.targetAmount || 0n),
            currentAmount: ethers.formatEther(pool.currentAmount || 0n),
            deadline: Number(pool.deadline || 0),
            beneficiary: pool.beneficiary || ethers.ZeroAddress,
            tokenAddress: pool.tokenAddress || ethers.ZeroAddress,
            tokenSymbol: pool.tokenAddress === ethers.ZeroAddress ? config.nativeSymbol : config.tokenSymbol,
            fundType: pool.fundType === 0 ? "Grouped" : "Personal",
            platformFeePercentage: Number(pool.platformFeePercentage || 0),
            status,
            userStatus,
            tags: await contract.getTags().catch(() => []),
          };
        } catch (err) {
          console.error(`Error processing GoalFund pool ${pool.contractAddress}:`, err);
          return null;
        }
      })
    ).then((pools) => pools.filter((pool) => pool !== null));
  }

  function filterPools() {
    let filtered = [...pools];
    if (searchQuery) {
      filtered = filtered.filter((pool) =>
        pool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (pool.type === "GoalFund" && pool.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())))
      );
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((pool) => pool.status === statusFilter);
    }
    setFilteredPools(filtered);
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
        toast.error(`Failed to switch to ${NETWORKS.celo.name}`);
        return false;
      }
    }
    return true;
  }

  async function fundGoodDollarRewards() {
    if (!(await ensureCorrectNetwork())) return;
    if (!isFactoryOwner) {
      toast.error("Only the factory owner can fund rewards");
      return;
    }
    if (!rewardFundingAmount || isNaN(rewardFundingAmount) || Number(rewardFundingAmount) <= 0) {
      toast.warning("Please enter a valid reward funding amount");
      return;
    }

    try {
      const goalFundFactory = new ethers.Contract(NETWORKS.celo.goalFundFactory, GoalFundFactoryAbi, signer);
      const goodDollarTokenAddress = await goalFundFactory.goodDollarToken();
      const amount = ethers.parseEther(rewardFundingAmount);

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

      const tx = await goalFundFactory.fundGoodDollarRewards(amount, { gasLimit: 200000 });
      await tx.wait();
      toast.success(`Successfully funded ${rewardFundingAmount} GoodDollar rewards!`);
      setRewardFundingAmount("");
      setIsAdminDialogOpen(false);
    } catch (error) {
      console.error("Error funding GoodDollar rewards:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to fund rewards"}`);
    }
  }

  async function joinContriboost(pool) {
    if (!(await ensureCorrectNetwork())) return;
    if (pool.userStatus.isParticipant) {
      toast.error("You are already a participant in this pool");
      return;
    }
    if (pool.status === "full" || pool.status === "completed") {
      toast.error(`Cannot join: Pool is ${pool.status}`);
      return;
    }
    if (pool.currentParticipants >= pool.expectedNumber) {
      toast.error("Pool has reached maximum participants");
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

      const contract = new ethers.Contract(pool.contractAddress, ContriboostAbi, signer);
      const tx = await contract.join({ gasLimit: 200000 });
      await tx.wait();
      await fetchPools();
      toast.success("Successfully joined the Contriboost pool!");
    } catch (error) {
      console.error("Error joining Contriboost:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to join"}`);
    }
  }

  async function contributeGoalFund(pool, amount = ethers.parseEther("0.01")) {
    if (!(await ensureCorrectNetwork())) return;
    if (pool.status !== "active" || pool.status === "achieved") {
      toast.error("Contributions are only allowed for active, non-achieved GoalFunds");
      return;
    }

    try {
      const contract = new ethers.Contract(pool.contractAddress, GoalFundAbi, signer);
      const isNative = pool.tokenAddress === ethers.ZeroAddress;

      if (!isNative) {
        const tokenContract = new ethers.Contract(pool.tokenAddress, IERC20Abi, signer);
        const allowance = await tokenContract.allowance(account, pool.contractAddress);
        if (allowance < amount) {
          const approveTx = await tokenContract.approve(pool.contractAddress, amount, { gasLimit: 100000 });
          await approveTx.wait();
        }
      }

      const tx = isNative
        ? await contract.contribute({ value: amount, gasLimit: 300000 })
        : await contract.contribute(amount, { gasLimit: 300000 });
      await tx.wait();
      await fetchPools();
      toast.success("Contribution successful!");
    } catch (error) {
      console.error("Error contributing to GoalFund:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to contribute"}`);
    }
  }

  async function exitContriboost(pool) {
    if (!(await ensureCorrectNetwork())) return;
    if (!pool.userStatus.isParticipant) {
      toast.error("You are not a participant in this pool");
      return;
    }
    if (pool.status !== "not-started") {
      toast.error("You can only exit before the pool starts");
      return;
    }

    try {
      const contract = new ethers.Contract(pool.contractAddress, ContriboostAbi, signer);
      const tx = await contract.exitContriboost({ gasLimit: 200000 });
      await tx.wait();
      await fetchPools();
      toast.success("Successfully exited the Contriboost pool!");
    } catch (error) {
      console.error("Error exiting Contriboost:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to exit"}`);
    }
  }

  async function handleCreateNavigation(path) {
    if (!account) {
      await connect();
      if (!account) return;
    }

    if (path.includes("/create/contribution")) {
      try {
        const response = await fetch(`/api/verify/status/${account}`);
        const data = await response.json();
        if (!data.verified) {
          router.push("/verify");
          return;
        }
      } catch (error) {
        console.error("Error checking verification status:", error);
        router.push("/verify");
        return;
      }
    }

    router.push(path);
  }

  function formatAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
  }

  function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function AdminActionsDialog() {
    return (
      <Dialog open={isAdminDialogOpen} onOpenChange={setIsAdminDialogOpen}>
        <DialogTrigger asChild>
          <Button disabled={isConnecting || !isFactoryOwner} className="min-w-[120px]">
            Admin Actions
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px] bg-[#101b31]">
          <DialogHeader>
            <DialogTitle>Admin Actions</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="rewardFundingAmount">Fund GoodDollar Rewards (G$)</Label>
              <Input
                id="rewardFundingAmount"
                type="number"
                step="0.000000000000000001"
                min="0"
                value={rewardFundingAmount}
                onChange={(e) => setRewardFundingAmount(e.target.value)}
                placeholder="Enter amount"
              />
              <Button
                onClick={isCorrectNetwork ? fundGoodDollarRewards : () => switchNetwork(NETWORKS.celo.chainId)}
                disabled={isConnecting}
                className="w-full"
              >
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isCorrectNetwork ? "Fund Rewards" : `Switch to ${NETWORKS.celo.name}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">All Pools</h1>
          <p className="text-muted-foreground">Browse Contriboost and GoalFund pools across networks</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={isConnecting}>
                {isConnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create New
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#101b31]">
              <DialogHeader>
                <DialogTitle>Choose what to create</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => handleCreateNavigation("/create/contribution")}
                  disabled={isConnecting}
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <Wallet className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">Create Contriboost Pool</h3>
                      <p className="text-sm text-muted-foreground">
                        Start a rotating savings pool with friends or community
                      </p>
                    </div>
                    <ChevronRight className="ml-auto h-5 w-5 self-center text-muted-foreground" />
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => handleCreateNavigation("/create/goalfund")}
                  disabled={isConnecting}
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <Coins className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">Create GoalFund</h3>
                      <p className="text-sm text-muted-foreground">Create a goal-based funding campaign</p>
                    </div>
                    <ChevronRight className="ml-auto h-5 w-5 self-center text-muted-foreground" />
                  </div>
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {isFactoryOwner && <AdminActionsDialog />}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search pools or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent className="bg-[#101b31]">
            <SelectItem value="all">All Pools</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="full">Full (Contriboost)</SelectItem>
            <SelectItem value="not-started">Not Started (Contriboost)</SelectItem>
            <SelectItem value="completed">Completed (Contriboost)</SelectItem>
            <SelectItem value="achieved">Achieved (GoalFund)</SelectItem>
            <SelectItem value="expired">Expired (GoalFund)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {fetchErrors.length > 0 && (
        <div className="mb-6 p-4 bg-red-100 text-red-800 rounded-lg">
          <p className="font-medium">Errors occurred while fetching pools:</p>
          <ul className="list-disc pl-5">
            {fetchErrors.map((error, index) => (
              <li key={index} className="text-sm">{error}</li>
            ))}
          </ul>
          <Button variant="outline" className="mt-2" onClick={fetchPools}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Fetching pools...</span>
        </div>
      ) : filteredPools.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <p className="text-lg mb-2">No pools found</p>
          <p className="text-muted-foreground mb-4">Try adjusting your filters or create a new pool</p>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={isConnecting}>
                {isConnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Create New Pool
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#101b31]">
              <DialogHeader>
                <DialogTitle>Choose what to create</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => handleCreateNavigation("/create/contribution")}
                  disabled={isConnecting}
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <Wallet className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">Create Contriboost Pool</h3>
                      <p className="text-sm text-muted-foreground">
                        Start a rotating savings pool with friends or community
                      </p>
                    </div>
                    <ChevronRight className="ml-auto h-5 w-5 self-center text-muted-foreground" />
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => handleCreateNavigation("/create/goalfund")}
                  disabled={isConnecting}
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-full">
                      <Coins className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">Create GoalFund</h3>
                      <p className="text-sm text-muted-foreground">Create a goal-based funding campaign</p>
                    </div>
                    <ChevronRight className="ml-auto h-5 w-5 self-center text-muted-foreground" />
                  </div>
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPools.map((pool) => {
            const isContriboost = pool.type === "Contriboost";
            const isJoined = pool.userStatus.isParticipant;
            const canJoin =
              isContriboost &&
              !isJoined &&
              pool.status !== "full" &&
              pool.status !== "completed" &&
              pool.currentParticipants < pool.expectedNumber;
            const canContribute = false; // Disable for all pools, as contributions are handled on details page
            const canExit = isContriboost && isJoined && pool.status === "not-started";
            const isCorrectNetwork = chainId === pool.chainId;

            return (
              <Card key={`${pool.contractAddress}-${pool.network}`} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {pool.name}
                        {!isContriboost && (
                          <span className="text-xs bg-purple-100 text-purple-800 py-0.5 px-1.5 rounded-full flex items-center">
                            <Tag className="h-3 w-3 mr-1" />
                            GoalFund
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {isContriboost
                          ? `${pool.dayRange} days per cycle`
                          : `Due ${formatDate(pool.deadline)}`}
                      </CardDescription>
                      <div className="flex items-center gap-1 mt-1">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {NETWORKS[pool.network].name}
                        </span>
                      </div>
                      {isContriboost && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Segment {pool.currentSegment} of {pool.expectedNumber}
                        </div>
                      )}
                      {!isContriboost && pool.fundType === "Grouped" && pool.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {pool.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="text-xs bg-blue-100 text-blue-800 py-0.5 px-2 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div
                      className={`text-xs font-medium py-1 px-2 rounded-full ${
                        pool.status === "active"
                          ? "bg-green-100 text-green-800"
                          : pool.status === "full"
                          ? "bg-amber-100 text-amber-800"
                          : pool.status === "not-started"
                          ? "bg-blue-100 text-blue-800"
                          : pool.status === "completed"
                          ? "bg-gray-100 text-gray-800"
                          : pool.status === "achieved"
                          ? "bg-teal-100 text-teal-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {pool.status === "active"
                        ? "Active"
                        : pool.status === "full"
                        ? "Full"
                        : pool.status === "not-started"
                        ? "Not Started"
                        : pool.status === "completed"
                        ? "Completed"
                        : pool.status === "achieved"
                        ? "Achieved"
                        : "Expired"}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {isContriboost ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Contribution</span>
                          <span className="font-medium">
                            {parseFloat(pool.contributionAmount).toFixed(4)} {pool.tokenSymbol}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Participants</span>
                          <span className="font-medium flex items-center">
                            <Users className="h-3 w-3 mr-1" />
                            {pool.currentParticipants}/{pool.expectedNumber}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Host Fee</span>
                          <span className="font-medium">{pool.hostFeePercentage / 100}%</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Target</span>
                          <span className="font-medium">
                            {parseFloat(pool.targetAmount).toFixed(4)} {pool.tokenSymbol}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Raised</span>
                          <span className="font-medium">
                            {parseFloat(pool.currentAmount).toFixed(4)} {pool.tokenSymbol}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Beneficiary</span>
                          <span className="font-medium">{formatAddress(pool.beneficiary)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Your Rewards</span>
                          <span className="font-medium">
                            {parseFloat(pool.userStatus.accumulatedRewards).toFixed(4)} G$
                          </span>
                        </div>
                      </>
                    )}
                    {isJoined && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {isContriboost ? "Your Status" : "Your Contribution"}
                        </span>
                        <span className="font-medium">
                          {isContriboost
                            ? pool.userStatus.hasReceivedFunds
                              ? "Received Funds"
                              : pool.userStatus.isActive
                              ? `Active (${pool.userStatus.missedDeposits} missed)`
                              : "Inactive"
                            : `${parseFloat(pool.userStatus.contributionAmount).toFixed(4)} ${pool.tokenSymbol}`}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-center gap-2 pt-2">
                  {pool.type === "GoalFund" ? (
                    <Button variant="outline" className="w-full max-w-xs" asChild>
                      <Link href={`/pools/details/${encodeURIComponent(pool.contractAddress)}?network=${pool.network}`}>
                        View Details
                      </Link>
                    </Button>
                  ) : (
                    <>
                      {(canJoin || canExit) && (
                        <Button
                          className="flex-1"
                          onClick={() =>
                            isCorrectNetwork
                              ? canJoin
                                ? joinContriboost(pool)
                                : exitContriboost(pool)
                              : switchNetwork(pool.chainId)
                          }
                          disabled={isConnecting}
                        >
                          {isConnecting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : isCorrectNetwork ? (
                            canJoin ? "Join" : "Exit"
                          ) : (
                            `Switch to ${NETWORKS[pool.network].name}`
                          )}
                        </Button>
                      )}
                      <Button variant="outline" className="flex-1" asChild>
                        <Link href={`/pools/details/${encodeURIComponent(pool.contractAddress)}?network=${pool.network}`}>
                          View Details
                        </Link>
                      </Button>
                    </>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}