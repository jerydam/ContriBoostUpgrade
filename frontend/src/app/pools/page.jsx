// app/pools/page.jsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import {
  NestoraFactoryAbi,
  NestoraAbi,
  SavingsFactoryAbi,
  SavingsAbi,
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
import { Progress } from "@/components/ui/progress";
import { StatTile, StatTileRow } from "@/components/dashboard/stat-tile";
import { Loader2, Plus, Search, Users, Wallet, Coins, ChevronRight, Tag, Layers, Zap } from "lucide-react";
import { toast } from "react-toastify";
// 🔵 DIVVI INTEGRATION
import { appendDivviTag, submitDivviReferral } from "@/lib/divvi-utils";

import {
  NESTORA_FACTORY_ADDRESS as Nestora_FACTORY_ADDRESS,
  SAVINGS_FACTORY_ADDRESS as SAVING_FACTORY_ADDRESS,
  NATIVE_SYMBOL,
  isNativeToken,
  getTokenSymbol,
} from "@/lib/chain-config";

export default function PoolsPage() {
  // 🔵 DIVVI INTEGRATION: Added chainId to destructuring
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

      // Fetch Nestora pools
      const NestoraFactory = new ethers.Contract(
        Nestora_FACTORY_ADDRESS,
        NestoraFactoryAbi,
        provider
      );
      const NestoraDetailsRaw = await NestoraFactory.getAllNestorasDetails();
      console.log("Raw Nestora details:", NestoraDetailsRaw);

      const NestoraPools = await Promise.all(
        NestoraDetailsRaw.map(async (pool) => {
          const contract = new ethers.Contract(pool.contractAddress, NestoraAbi, provider);
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
            type: "Nestora",
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
        SAVING_FACTORY_ADDRESS,
        SavingsFactoryAbi,
        provider
      );
      const goalFundDetailsRaw = await goalFundFactory.getAllSavingsDetails();
      console.log("Raw GoalFund details:", goalFundDetailsRaw);

      const goalFundPools = await Promise.all(
        goalFundDetailsRaw.map(async (pool) => {
          // Skip personal GoalFunds
          if (pool.fundType === 1) return null; // FundType 1 is personal

          const contract = new ethers.Contract(pool.contractAddress, SavingsAbi, provider);
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
            // Savings has no on-chain tags; kept so search/filter code stays uniform.
            tags: [],
          };
        })
      );

      // Filter out null entries (personal GoalFunds) and deduplicate by contractAddress
      const allPoolsRaw = [...NestoraPools, ...goalFundPools.filter(pool => pool !== null)];
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

  // 🔵 DIVVI INTEGRATION: Updated joinNestora with Divvi tracking
  async function joinNestora(pool) {
    if (!signer || !account) {
      await connect();
      if (!account) return;
    }

    try {
      const contract = new ethers.Contract(pool.contractAddress, NestoraAbi, signer);
      
      // 🔵 DIVVI STEP 1: Get populated transaction
      const populatedTx = await contract.join.populateTransaction();
      
      // 🔵 DIVVI STEP 2: Append Divvi referral tag
      const dataWithTag = appendDivviTag(populatedTx.data, account);
      
      // 🔵 DIVVI STEP 3: Send transaction with Divvi tracking
      const tx = await signer.sendTransaction({
        to: pool.contractAddress,
        data: dataWithTag,
        gasLimit: 200000,
      });
      
      const receipt = await tx.wait();
      
      // 🔵 DIVVI STEP 4: Submit referral to Divvi
      await submitDivviReferral(receipt.hash || tx.hash, chainId);
      
      await fetchPools();
      toast.success("Successfully joined the Nestora pool!");
    } catch (error) {
      console.error("Error joining Nestora:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to join"}`);
    }
  }

  // 🔵 DIVVI INTEGRATION: Updated contributeGoalFund with Divvi tracking
  async function contributeGoalFund(pool, amount = ethers.parseEther("0.01")) {
    if (!signer || !account) {
      await connect();
      if (!account) return;
    }

    try {
      const contract = new ethers.Contract(pool.contractAddress, SavingsAbi, signer);
      const isETH = isNativeToken(pool.tokenAddress);
      
      // 🔵 DIVVI STEP 1: Get populated transaction
      const populatedTx = isETH
        ? await contract.contribute.populateTransaction({ value: amount })
        : await contract.contribute.populateTransaction(amount);
      
      // 🔵 DIVVI STEP 2: Append Divvi referral tag
      const dataWithTag = appendDivviTag(populatedTx.data, account);
      
      // 🔵 DIVVI STEP 3: Send transaction with Divvi tracking
      const tx = await signer.sendTransaction({
        to: pool.contractAddress,
        data: dataWithTag,
        value: isETH ? amount : undefined,
        gasLimit: 300000,
      });
      
      const receipt = await tx.wait();
      
      // 🔵 DIVVI STEP 4: Submit referral to Divvi
      await submitDivviReferral(receipt.hash || tx.hash, chainId);
      
      await fetchPools();
      toast.success("Contribution successful!");
    } catch (error) {
      console.error("Error contributing to GoalFund:", error);
      toast.error(`Error: ${error.reason || error.message || "Failed to contribute"}`);
    }
  }

  async function exitNestora(pool) {
    toast.error("Exit functionality not implemented in Nestora contract.");
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
          <p className="text-muted-foreground">Browse Nestora and GoalFund pools</p>
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
          <DialogContent>
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
                    <h3 className="font-medium">Create Nestora Pool</h3>
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

      <StatTileRow className="grid-cols-3 mb-8">
        <StatTile icon={Layers} label="Total Pools" value={pools.length} />
        <StatTile
          icon={Zap}
          label="Active Now"
          value={pools.filter((p) => p.status === "active").length}
        />
        <StatTile
          icon={Users}
          label="Your Pools"
          value={pools.filter((p) => p.userStatus?.isParticipant).length}
        />
      </StatTileRow>

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
          <SelectContent>
            <SelectItem value="all">All Pools</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="full">Full (Nestora)</SelectItem>
            <SelectItem value="not-started">Not Started (Nestora)</SelectItem>
            <SelectItem value="achieved">Achieved (GoalFund)</SelectItem>
            <SelectItem value="expired">Expired (GoalFund)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true" aria-live="polite">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="h-5 w-32 rounded-md bg-muted animate-pulse" />
                <div className="h-5 w-14 rounded-full bg-muted animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-3.5 w-full rounded-md bg-muted animate-pulse" />
                <div className="h-3.5 w-3/4 rounded-md bg-muted animate-pulse" />
                <div className="h-3.5 w-2/3 rounded-md bg-muted animate-pulse" />
              </div>
              <div className="flex gap-2 pt-2">
                <div className="h-9 flex-1 rounded-md bg-muted animate-pulse" />
                <div className="h-9 flex-1 rounded-md bg-muted animate-pulse" />
              </div>
            </div>
          ))}
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
            <DialogContent>
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
                      <h3 className="font-medium">Create Nestora Pool</h3>
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
            const isNestora = pool.type === "Nestora";
            const isJoined = pool.userStatus.isParticipant;
            const canJoin =
              isNestora &&
              !isJoined &&
              pool.status !== "full" &&
              pool.currentParticipants < pool.expectedNumber;
            const canContribute = !isNestora && pool.status === "active";
            const canExit = isNestora && isJoined && pool.status === "not-started";

            return (
              <Card key={pool.contractAddress} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {pool.name}
                        {!isNestora && (
                          <span className="text-xs bg-accent text-accent-foreground py-0.5 px-1.5 rounded-full flex items-center">
                            <Tag className="h-3 w-3 mr-1" />
                            GoalFund
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {isNestora
                          ? `${pool.dayRange} days per cycle`
                          : `Due ${formatDate(pool.deadline)}`}
                      </CardDescription>
                      {!isNestora && pool.fundType === "grouped" && pool.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {pool.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="text-xs bg-secondary text-secondary-foreground py-0.5 px-2 rounded-full"
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
                          ? "bg-primary/15 text-primary"
                          : pool.status === "full"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : pool.status === "not-started"
                          ? "bg-muted text-muted-foreground"
                          : pool.status === "achieved"
                          ? "bg-primary/15 text-primary"
                          : "bg-destructive/15 text-destructive"
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
                <CardContent className="pb-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold font-numeric">
                      {isNestora ? pool.contributionAmount : pool.currentAmount}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {getTokenSymbol(pool.tokenAddress)}
                      {isNestora ? " / cycle" : ` of ${pool.targetAmount} target`}
                    </span>
                  </div>
                  <Progress
                    value={
                      isNestora
                        ? Math.min((pool.currentParticipants / pool.expectedNumber) * 100, 100)
                        : Math.min(
                            (Number(pool.currentAmount) / Number(pool.targetAmount || 1)) * 100,
                            100
                          )
                    }
                    className="h-1.5 mt-3"
                  />
                </CardContent>
                <CardContent>
                  <div className="space-y-2">
                    {isNestora ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Participants</span>
                          <span className="font-medium font-numeric flex items-center">
                            <Users className="h-3.5 w-3.5 mr-1" />
                            {pool.currentParticipants}/{pool.expectedNumber}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Host Fee</span>
                          <span className="font-medium font-numeric">{pool.hostFeePercentage / 100}%</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Beneficiary</span>
                          <span className="font-medium font-numeric">{formatAddress(pool.beneficiary)}</span>
                        </div>
                      </>
                    )}
                    {isJoined && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {isNestora ? "Your Status" : "Your Contribution"}
                        </span>
                        <span className="font-medium font-numeric">
                          {isNestora
                            ? pool.userStatus.hasReceivedFunds
                              ? "Received Funds"
                              : "Active"
                            : `${pool.userStatus.contributionAmount} ${
                                isNativeToken(pool.tokenAddress) ? NATIVE_SYMBOL : "Tokens"
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
                          ? joinNestora(pool)
                          : canContribute
                          ? contributeGoalFund(pool)
                          : exitNestora(pool)
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