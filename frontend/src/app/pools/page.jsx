"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import { ContriboostFactoryAbi, ContriboostAbi } from "@/lib/contractabi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Search, Users, Wallet, Coins, ChevronRight } from "lucide-react";

const FACTORY_ADDRESS = "0xe435787A41Ba01D631F914dFD69190CCdfD358Bd";

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
      const interval = setInterval(fetchPools, 30000); // Poll every 30s for updates
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
      console.log("Fetching pools from factory at:", FACTORY_ADDRESS, "on chain:", chainId);
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, ContriboostFactoryAbi, provider);
      const poolAddresses = await factoryContract.getContriboosts();
      console.log("Pool addresses:", poolAddresses);

      if (!poolAddresses || poolAddresses.length === 0) {
        console.log("No pools found.");
        setPools([]);
        setIsLoading(false);
        return;
      }

      const poolsWithStatus = await Promise.all(
        poolAddresses.map(async (addr) => {
          const pool = (await factoryContract.getContriboostDetails(addr, true))[0];
          const contriboostContract = new ethers.Contract(addr, ContriboostAbi, provider);
          const participants = await contriboostContract.getActiveParticipants();
          const currentSegment = await contriboostContract.currentSegment();
          const startTimestamp = await contriboostContract.startTimestamp();
          const now = Math.floor(Date.now() / 1000);

          let status = "not-started";
          if (now < startTimestamp) {
            status = "not-started";
          } else if (participants.length >= Number(pool.expectedNumber)) {
            status = "full";
          } else if (currentSegment > 0) {
            status = "active";
          }

          return {
            contractAddress: addr,
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
          };
        })
      );

      setPools(poolsWithStatus);
    } catch (error) {
      console.error("Error fetching pools:", error.code, error.message, error.data);
      if (error.code === "CALL_EXCEPTION") {
        console.log("Contract call failed - check address or chain.");
      } else if (error.code === "BAD_DATA") {
        console.log("ABI mismatch or contract not deployed.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function filterPools() {
    let filtered = [...pools];
    if (searchQuery) {
      filtered = filtered.filter((pool) => pool.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((pool) => pool.status === statusFilter);
    }
    setFilteredPools(filtered);
  }

  async function joinPool(pool) {
    if (!signer || !account) {
      await connect();
      if (!account) return;
    }

    try {
      const contriboostContract = new ethers.Contract(pool.contractAddress, ContriboostAbi, signer);
      const tx = await contriboostContract.join();
      await tx.wait();
      await fetchPools();
      alert("Successfully joined the pool!");
    } catch (error) {
      console.error("Error joining pool:", error);
      alert(`Error: ${error.reason || error.message || "Failed to join"}`);
    }
  }

  const handleCreateNavigation = async (path) => {
    setIsCreateDialogOpen(false);
    if (!account) {
      await connect();
      if (!account) return;
    }
    router.push(path);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Contriboost Pools</h1>
          <p className="text-muted-foreground">Browse and join rotating savings pools</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={isConnecting}>
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
                onClick={() => handleCreateNavigation("/create/contriboost")}
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
            placeholder="Search pools..."
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
            <SelectItem value="full">Full</SelectItem>
            <SelectItem value="not-started">Not Started</SelectItem>
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
              <Button disabled={isConnecting}>
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
                  onClick={() => handleCreateNavigation("/create/contriboost")}
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
          {filteredPools.map((pool) => (
            <Card key={pool.contractAddress} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{pool.name}</CardTitle>
                    <CardDescription>{pool.dayRange} days per cycle</CardDescription>
                  </div>
                  <div
                    className={`text-xs font-medium py-1 px-2 rounded-full ${
                      pool.status === "active"
                        ? "bg-green-100 text-green-800"
                        : pool.status === "full"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {pool.status === "active" ? "Active" : pool.status === "full" ? "Full" : "Not Started"}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contribution</span>
                    <span className="font-medium">
                      {pool.contributionAmount} {pool.tokenAddress === ethers.ZeroAddress ? "ETH" : "Tokens"}
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
                </div>
              </CardContent>
              <CardFooter className="flex gap-2 pt-2">
                {pool.status !== "full" && (
                  <Button className="flex-1" onClick={() => joinPool(pool)} disabled={isConnecting}>
                    {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Join
                  </Button>
                )}
                <Button variant="outline" className="flex-1" asChild>
                  <Link href={`/pools/${pool.contractAddress}`}>View Dashboard</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}