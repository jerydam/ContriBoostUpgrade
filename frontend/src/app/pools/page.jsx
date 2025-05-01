"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import {
  ContriboostFactoryAbi,
  ContriboostAbi,
  GoalFundFactoryAbi,
  GoalFundAbi,
  CeloContriboostFactoryAbi,
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

// Contract addresses and network configurations
const NETWORKS = {
  lisk: {
    chainId: 4202,
    name: "Lisk Sepolia",
    rpcUrl: "https://rpc.sepolia-api.lisk.com",
    contriboostFactory: "0xaE83198F4c622a5dccdda1B494fF811f5B6F3631",
    goalFundFactory: "0x791F269E311aE13e490ffEf7DFd68f27f7B21E41",
    tokenAddress: "0x2728DD8B45B788e26d12B13Db5A244e5403e7eda", // USDT
    tokenSymbol: "USDT",
    nativeSymbol: "ETH",
  },
  celo: {
    chainId: 44787,
    name: "Celo Alfajores",
    rpcUrl: "https://alfajores-forno.celo-testnet.org",
    contriboostFactory: "0x2cF3869e0522ebEa4161ff601d5711A7Af13ebA3",
    goalFundFactory: "0x2F07fc486b87B5512b3e33E369E0151de52BE1dA",
    tokenAddress: "0x874069Fa1Eb16D44d622BC6Cf1632c057f6F7f2d", // cUSD
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
  const router = useRouter();

  // Initialize providers for both networks
  const liskProvider = new ethers.JsonRpcProvider(NETWORKS.lisk.rpcUrl);
  const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);

  useEffect(() => {
    fetchPools();
  }, []);

  useEffect(() => {
    filterPools();
  }, [pools, searchQuery, statusFilter]);

  async function fetchPools() {
    setIsLoading(true);
    setFetchErrors([]);
    const allPools = [];

    // Fetch Lisk Sepolia Contriboost pools
    try {
      const liskContriboostPools = await fetchContriboostPools("lisk", liskProvider, ContriboostFactoryAbi);
      allPools.push(...liskContriboostPools);
    } catch (error) {
      console.error("Error fetching Lisk Sepolia Contriboost pools:", error);
      setFetchErrors((prev) => [...prev, `Lisk Sepolia Contriboost: ${error.message}`]);
    }

    // Fetch Lisk Sepolia GoalFund pools
    try {
      const liskGoalFundPools = await fetchGoalFundPools("lisk", liskProvider);
      allPools.push(...liskGoalFundPools);
    } catch (error) {
      console.error("Error fetching Lisk Sepolia GoalFund pools:", error);
      setFetchErrors((prev) => [...prev, `Lisk Sepolia GoalFund: ${error.message}`]);
    }

    // Fetch Celo Alfajores Contriboost pools
    try {
      const celoContriboostPools = await fetchContriboostPools("celo", celoProvider, CeloContriboostFactoryAbi);
      allPools.push(...celoContriboostPools);
    } catch (error) {
      console.error("Error fetching Celo Alfajores Contriboost pools:", error);
      setFetchErrors((prev) => [...prev, `Celo Alfajores Contriboost: ${error.message}`]);
    }

    // Fetch Celo Alfajores GoalFund pools
    try {
      const celoGoalFundPools = await fetchGoalFundPools("celo", celoProvider);
      allPools.push(...celoGoalFundPools);
    } catch (error) {
      console.error("Error fetching Celo Alfajores GoalFund pools:", error);
      setFetchErrors((prev) => [...prev, `Celo Alfajores GoalFund: ${error.message}`]);
    }

    // Deduplicate by contractAddress and network
    const seen = new Set();
    const deduplicatedPools = allPools.filter((pool) => {
      const key = `${pool.contractAddress}-${pool.network}`;
      if (seen.has(key)) {
        console.warn(`Duplicate pool found: ${key}`);
        return false;
      }
      seen.add(key);
      return true;
    });

    setPools(deduplicatedPools);
    setIsLoading(false);

    if (fetchErrors.length > 0) {
      toast.error("Some pools failed to load. Check console for details.");
    }
  }

  async function fetchContriboostPools(network, provider, factoryAbi) {
    const config = NETWORKS[network];
    const contriboostFactory = new ethers.Contract(
      config.contriboostFactory,
      factoryAbi,
      provider
    );

    let contriboostAddresses = [];
    try {
      console.log(`Fetching Contriboost addresses for ${config.name} at ${config.contriboostFactory}...`);
      contriboostAddresses = await contriboostFactory.getContriboosts();
      console.log(`Contriboost addresses for ${config.name}:`, contriboostAddresses);
    } catch (error) {
      console.warn(`Failed to fetch Contriboost addresses for ${config.name}:`, error);
      contriboostAddresses = [];
    }

    const contriboostDetails = await Promise.all(
      contriboostAddresses.map(async (address) => {
        try {
          const detailsArray = await contriboostFactory.getContriboostDetails(address, false);
          if (!detailsArray || !detailsArray[0]) {
            console.warn(`No details returned for Contriboost at ${address} on ${config.name}`);
            return null;
          }
          const details = detailsArray[0];

          const contract = new ethers.Contract(address, ContriboostAbi, provider);
          let participants = [];
          let currentSegment = 0;
          let startTimestamp = 0;
          try {
            participants = await contract.getActiveParticipants();
            currentSegment = await contract.currentSegment();
            startTimestamp = await contract.startTimestamp();
          } catch (err) {
            console.warn(`Failed to fetch additional data for Contriboost at ${address} on ${config.name}:`, err);
          }

          const now = Math.floor(Date.now() / 1000);
          let status = "not-started";
          if (now < startTimestamp) {
            status = "not-started";
          } else if (participants.length >= Number(details.expectedNumber)) {
            status = "full";
          } else if (currentSegment > 0) {
            status = "active";
          }

          let userStatus = { isParticipant: false, hasReceivedFunds: false };
          if (account && chainId === config.chainId) {
            try {
              const participantStatus = await contract.getParticipantStatus(account);
              userStatus = {
                isParticipant: participantStatus.exists,
                hasReceivedFunds: participantStatus.receivedFunds,
              };
            } catch (err) {
              console.warn(`Failed to fetch participant status for ${address} on ${config.name}:`, err);
            }
          }

          return {
            type: "Contriboost",
            network,
            chainId: config.chainId,
            contractAddress: details.contractAddress,
            name: details.name || "Unnamed Pool",
            dayRange: Number(details.dayRange || 0),
            expectedNumber: Number(details.expectedNumber || 0),
            contributionAmount: ethers.formatEther(details.contributionAmount || 0n),
            tokenAddress: details.tokenAddress || ethers.ZeroAddress,
            tokenSymbol: details.tokenAddress === ethers.ZeroAddress ? config.nativeSymbol : config.tokenSymbol,
            hostFeePercentage: Number(details.hostFeePercentage || 0),
            platformFeePercentage: Number(details.platformFeePercentage || 0),
            maxMissedDeposits: Number(details.maxMissedDeposits || 0),
            currentParticipants: participants.length,
            status,
            userStatus,
          };
        } catch (err) {
          console.error(`Error processing Contriboost at ${address} on ${config.name}:`, err);
          return null;
        }
      })
    );

    return contriboostDetails.filter((pool) => pool !== null);
  }

  async function fetchGoalFundPools(network, provider) {
    const config = NETWORKS[network];
    const goalFundFactory = new ethers.Contract(
      config.goalFundFactory,
      GoalFundFactoryAbi,
      provider
    );

    let goalFundDetailsRaw = [];
    try {
      console.log(`Fetching GoalFund pools for ${config.name}...`);
      goalFundDetailsRaw = await goalFundFactory.getAllGoalFundsDetails();
      console.log(`Raw GoalFund data for ${config.name}:`, goalFundDetailsRaw);
    } catch (error) {
      console.warn(`Failed to fetch GoalFund details for ${config.name}:`, error);
      goalFundDetailsRaw = [];
    }

    return Promise.all(
      goalFundDetailsRaw.map(async (pool) => {
        try {
          if (pool.fundType === 1) return null; // Skip personal GoalFunds

          const contract = new ethers.Contract(pool.contractAddress, GoalFundAbi, provider);
          let goal = { achieved: false };
          try {
            goal = await contract.goal();
          } catch (err) {
            console.warn(`Failed to fetch goal for GoalFund at ${pool.contractAddress} on ${config.name}:`, err);
          }

          const now = Math.floor(Date.now() / 1000);
          let status = "active";
          if (now > Number(pool.deadline)) {
            status = goal.achieved ? "achieved" : "expired";
          } else if (goal.achieved) {
            status = "achieved";
          }

          let userStatus = { isParticipant: false, contributionAmount: "0" };
          if (account && chainId === config.chainId) {
            try {
              const contribution = await contract.contributions(account);
              userStatus = {
                isParticipant: contribution > 0,
                contributionAmount: ethers.formatEther(contribution),
              };
            } catch (err) {
              console.warn(`Failed to fetch contribution for ${pool.contractAddress} on ${config.name}:`, err);
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
            tags: pool.fundType === 0 ? await contract.getTags().catch(() => []) : [],
          };
        } catch (err) {
          console.error(`Error processing GoalFund pool ${pool.contractAddress} on ${config.name}:`, err);
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

  async function ensureCorrectNetwork(poolChainId) {
    if (!account) {
      await connect();
      if (!account) {
        toast.error("Please connect your wallet");
        return false;
      }
    }
    if (chainId !== poolChainId) {
      try {
        await switchNetwork(poolChainId);
        toast.success(`Switched to ${NETWORKS[poolChainId === NETWORKS.lisk.chainId ? "lisk" : "celo"].name}`);
        return true;
      } catch (error) {
        toast.error(`Failed to switch to ${NETWORKS[poolChainId === NETWORKS.lisk.chainId ? "lisk" : "celo"].name}: ${error.message}`);
        return false;
      }
    }
    return true;
  }

  async function joinContriboost(pool) {
    if (!(await ensureCorrectNetwork(pool.chainId))) return;

    try {
      const contract = new ethers.Contract(pool.contractAddress, ContriboostAbi, signer);
      const tx = await contract.join();
      await tx.wait();
      await fetchPools();
      toast.success("Successfully joined the Contriboost pool!");
    } catch (error) {
      console.error("Error joining Contriboost:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to join"}`);
    }
  }

  async function contributeGoalFund(pool, amount = ethers.parseEther("0.01")) {
    if (!(await ensureCorrectNetwork(pool.chainId))) return;

    try {
      const contract = new ethers.Contract(pool.contractAddress, GoalFundAbi, signer);
      const isNative = pool.tokenAddress === ethers.ZeroAddress;
      const tx = isNative
        ? await contract.contribute({ value: amount })
        : await contract.contribute(amount);
      await tx.wait();
      await fetchPools();
      toast.success("Contribution successful!");
    } catch (error) {
      console.error("Error contributing to GoalFund:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to contribute"}`);
    }
  }

  async function exitContriboost(pool) {
    if (!(await ensureCorrectNetwork(pool.chainId))) return;
    toast.error("Exit functionality not implemented in Contriboost contract.");
  }

  async function handleCreateNavigation(path) {
    setIsCreateDialogOpen(false);
    if (!account) {
      await connect();
      if (!account) return;
    }
    router.push(path);
  }

  function formatAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
  }

  function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">All Pools</h1>
          <p className="text-muted-foreground">Browse Contriboost and GoalFund pools across networks</p>
        </div>
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
          <span className="ml-2">Loading pools...</span>
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
              pool.currentParticipants < pool.expectedNumber;
            const canContribute = !isContriboost && pool.status === "active";
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
                            <Users className="h-3.5 w-3.5 mr-1" />
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
                              : "Active"
                            : `${parseFloat(pool.userStatus.contributionAmount).toFixed(4)} ${pool.tokenSymbol}`}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2 pt-2">
                  {(canJoin || canContribute || canExit) && (
                    <Button
                      className="flex-1"
                      onClick={() =>
                        isCorrectNetwork
                          ? canJoin
                            ? joinContriboost(pool)
                            : canContribute
                            ? contributeGoalFund(pool)
                            : exitContriboost(pool)
                          : switchNetwork(pool.chainId)
                      }
                      disabled={isConnecting}
                    >
                      {isConnecting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : isCorrectNetwork ? (
                        canJoin ? "Join" : canContribute ? "Contribute" : "Exit"
                      ) : (
                        `Switch to ${NETWORKS[pool.network].name}`
                      )}
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1" asChild>
                    <Link href={`/pools/details/${pool.contractAddress}?network=${pool.network}`}>
                      View Details
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}