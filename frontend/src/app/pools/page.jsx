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
import { Loader2, Plus, Search, Users, Wallet, Coins, ChevronRight, Tag } from "lucide-react";
import { toast } from "react-toastify";

const CONTRIBOOST_FACTORY_ADDRESS = "0x6580B6E641061D71c809f8EDa8a522f9EB88F180";
const GOALFUND_FACTORY_ADDRESS = "0x075fdc4CC845BB7D0049EDEe798b6B208B6ECDaF";
const CELO_ADDRESS = "0x471ece3750da237f93b8e339c536989b8978a438"; // CELO token (ERC20)
const CUSD_ADDRESS = "0x765de816845861e75a25fca122bb6898b8b1282a"; // cUSD token
export default function PoolsPage() {
  const { provider, signer, account, chainId, connect, isConnecting } = useWeb3();
  const [pools, setPools] = useState([]);
  const [filteredPools, setFilteredPools] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (provider && chainId) {
      fetchPools();
      const interval = setInterval(fetchPools, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }
  }, [provider, account, chainId]);

  useEffect(() => {
    filterPools();
  }, [pools, searchQuery, statusFilter]);

  async function fetchPools() {
    if (!provider) return;

    setIsLoading(true);
    try {
      console.log("Fetching pools on chain:", chainId);

      // Fetch Contriboost pools
      const contriboostFactory = new ethers.Contract(
        CONTRIBOOST_FACTORY_ADDRESS,
        ContriboostFactoryAbi,
        provider
      );
      const contriboostDetailsRaw = await contriboostFactory.getAllContriboostsDetails();
      console.log("Raw Contriboost details:", contriboostDetailsRaw);

      const contriboostPools = await Promise.all(
        contriboostDetailsRaw.map(async (pool) => {
          const contract = new ethers.Contract(pool.contractAddress, ContriboostAbi, provider);
          const participants = await contract.getActiveParticipants();
          const currentSegment = await contract.currentSegment();
          const startTimestamp = await contract.startTimestamp();
          const now = Math.floor(Date.now() / 1000);

          let status = "not-started";
          if (now < startTimestamp) {
            status = "not-started";
          } else if (participants.length >= Number(pool.expectedNumber)) {
            status = "full";
          } else if (currentSegment > 0) {
            status = "active";
          }

          let userStatus = { isParticipant: false, hasReceivedFunds: false };
          if (account) {
            const participantStatus = await contract.getParticipantStatus(account);
            userStatus = {
              isParticipant: participantStatus.exists,
              hasReceivedFunds: participantStatus.receivedFunds,
            };
          }

          return {
            type: "Contriboost",
            contractAddress: pool.contractAddress,
            name: pool.name,
            dayRange: Number(pool.dayRange),
            expectedNumber: Number(pool.expectedNumber),
            contributionAmount: ethers.formatEther(pool.contributionAmount),
            tokenAddress: pool.tokenAddress,
            hostFeePercentage: Number(pool.hostFeePercentage),
            platformFeePercentage: Number(pool.platformFeePercentage),
            maxMissedDeposits: Number(pool.maxMissedDeposits),
            currentParticipants: participants.length,
            status,
            userStatus,
          };
        })
      );

      // Fetch GoalFund pools
      const goalFundFactory = new ethers.Contract(
        GOALFUND_FACTORY_ADDRESS,
        GoalFundFactoryAbi,
        provider
      );
      const goalFundDetailsRaw = await goalFundFactory.getAllGoalFundsDetails();
      console.log("Raw GoalFund details:", goalFundDetailsRaw);

      const goalFundPools = await Promise.all(
        goalFundDetailsRaw.map(async (pool) => {
          // Skip personal GoalFunds
          if (pool.fundType === 1) return null; // FundType 1 is personal

          const contract = new ethers.Contract(pool.contractAddress, GoalFundAbi, provider);
          const goal = await contract.goal();
          const now = Math.floor(Date.now() / 1000);

          let status = "active";
          if (now > Number(pool.deadline)) {
            status = goal.achieved ? "achieved" : "expired";
          } else if (goal.achieved) {
            status = "achieved";
          }

          let userStatus = { isParticipant: false, contributionAmount: "0" };
          if (account) {
            const contribution = await contract.contributions(account);
            userStatus = {
              isParticipant: contribution > 0,
              contributionAmount: ethers.formatEther(contribution),
            };
          }

          return {
            type: "GoalFund",
            contractAddress: pool.contractAddress,
            name: pool.name,
            targetAmount: ethers.formatEther(pool.targetAmount),
            currentAmount: ethers.formatEther(pool.currentAmount),
            deadline: Number(pool.deadline),
            beneficiary: pool.beneficiary,
            tokenAddress: pool.tokenAddress,
            fundType: pool.fundType === 0 ? "Grouped" : "Personal",
            platformFeePercentage: Number(pool.platformFeePercentage),
            status,
            userStatus,
            tags: pool.fundType === 0 ? await contract.getTags() : [],
          };
        })
      );

      // Filter out null entries (personal GoalFunds) and deduplicate by contractAddress
      const allPoolsRaw = [...contriboostPools, ...goalFundPools.filter(pool => pool !== null)];
      const seenAddresses = new Set();
      const allPools = allPoolsRaw.filter(pool => {
        if (seenAddresses.has(pool.contractAddress)) {
          console.warn(`Duplicate pool found: ${pool.contractAddress}`);
          return false;
        }
        seenAddresses.add(pool.contractAddress);
        return true;
      });

      console.log("All fetched pools:", allPools);
      setPools(allPools);
    } catch (error) {
      console.error("Error fetching pools:", error);
    } finally {
      setIsLoading(false);
    }
  }

  function filterPools() {
    let filtered = [...pools];
    if (searchQuery) {
      filtered = filtered.filter((pool) =>
        pool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (pool.type === "GoalFund" && pool.tags.some(tag => 
          tag.toLowerCase().includes(searchQuery.toLowerCase())))
      );
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((pool) => pool.status === statusFilter);
    }
    setFilteredPools(filtered);
  }

  async function joinContriboost(pool) {
    if (!signer || !account) {
      await connect();
      if (!account) return;
    }

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
    if (!signer || !account) {
      await connect();
      if (!account) return;
    }

    try {
      const contract = new ethers.Contract(pool.contractAddress, GoalFundAbi, signer);
      const isETH = pool.tokenAddress === CELO_ADDRESS;
      const tx = isETH
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
    toast.error("Exit functionality not implemented in Contriboost contract.");
  }

  const handleCreateNavigation = async (path) => {
    setIsCreateDialogOpen(false);
    if (!account) {
      await connect();
      if (!account) return;
    }
    router.push(path);
  };

  function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">All Pools</h1>
          <p className="text-muted-foreground">Browse Contriboost and GoalFund pools</p>
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
                  onClick={() => handleCreateNavigation("/createos/contribution")}
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

            return (
              <Card key={pool.contractAddress} className="overflow-hidden">
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
                      {!isContriboost && pool.fundType === "grouped" && pool.tags.length > 0 && (
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
                            {pool.contributionAmount}{" "}
                            {pool.tokenAddress === CELO_ADDRESS ? "ETH" : "Tokens"}
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
                            {pool.targetAmount}{" "}
                            {pool.tokenAddress === CELO_ADDRESS ? "ETH" : "Tokens"}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Raised</span>
                          <span className="font-medium">
                            {pool.currentAmount}{" "}
                            {pool.tokenAddress === CELO_ADDRESS ? "ETH" : "Tokens"}
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
                            : `${pool.userStatus.contributionAmount} ${
                                pool.tokenAddress === CELO_ADDRESS ? "ETH" : "Tokens"
                              }`}
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
                        canJoin
                          ? joinContriboost(pool)
                          : canContribute
                          ? contributeGoalFund(pool)
                          : exitContriboost(pool)
                      }
                      disabled={isConnecting}
                    >
                      {isConnecting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : canJoin ? (
                        "Join"
                      ) : canContribute ? (
                        "Contribute"
                      ) : (
                        "Exit"
                      )}
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1" asChild>
                    <Link href={`/pools/details/${pool.contractAddress}`}>
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