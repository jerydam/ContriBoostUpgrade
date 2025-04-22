"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import { ContriboostFactoryAbi, ContriboostAbi, GoalFundFactoryAbi } from "@/lib/contractabi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, PlusCircle, AlertCircle } from "lucide-react";

// Contract addresses
const CONTRIBOOST_FACTORY_ADDRESS = "0xaE83198F4c622a5dccdda1B494fF811f5B6F3631";
const GOALFUND_FACTORY_ADDRESS = "0x791F269E311aE13e490ffEf7DFd68f27f7B21E41";

export default function AccountPage() {
  const { provider, account, connect, isConnecting } = useWeb3();
  const [balance, setBalance] = useState("0");
  const [userPools, setUserPools] = useState([]);
  const [userFunds, setUserFunds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (provider && account) {
      fetchUserData();
    } else {
      setIsLoading(false);
    }
  }, [provider, account]);

  async function fetchUserData() {
    if (!provider || !account) return;

    setIsLoading(true);
    setError(null);
    try {
      // Fetch account balance
      const accountBalance = await provider.getBalance(account);
      setBalance(ethers.formatEther(accountBalance));

      // Fetch user's Contriboost pools
      const contriboostFactory = new ethers.Contract(
        CONTRIBOOST_FACTORY_ADDRESS,
        ContriboostFactoryAbi,
        provider
      );
      const userContriboostAddresses = await contriboostFactory.getUserContriboosts(account);
      const contriboostDetails = await Promise.all(
        userContriboostAddresses.map(async (address) => {
          try {
            const detailsArray = await contriboostFactory.getContriboostDetails(address, false);
            if (!detailsArray || !detailsArray[0]) {
              console.warn(`No details returned for Contriboost at ${address}`);
              return null;
            }
            const details = detailsArray[0];

            // Fetch current participants from the Contriboost contract
            const contriboostContract = new ethers.Contract(address, ContriboostAbi, provider);
            let currentParticipants = 0;
            try {
              const activeParticipants = await contriboostContract.getActiveParticipants();
              currentParticipants = activeParticipants.length;
            } catch (err) {
              console.warn(`Failed to fetch active participants for ${address}:`, err);
            }

            return {
              contractAddress: details.contractAddress,
              name: details.name || "Unnamed Pool",
              dayRange: Number(details.dayRange || 0),
              expectedNumber: Number(details.expectedNumber || 0),
              contributionAmount: ethers.formatEther(details.contributionAmount || 0n),
              hostFeePercentage: Number(details.hostFeePercentage || 0),
              currentParticipants,
            };
          } catch (err) {
            console.error(`Error processing Contriboost at ${address}:`, err);
            return null;
          }
        })
      );
      setUserPools(contriboostDetails.filter((pool) => pool !== null));

      // Fetch user's GoalFunds
      const goalFundFactory = new ethers.Contract(
        GOALFUND_FACTORY_ADDRESS,
        GoalFundFactoryAbi,
        provider
      );
      const userGoalFundAddresses = await goalFundFactory.getUserGoalFunds(account);
      const goalFundDetails = await Promise.all(
        userGoalFundAddresses.map(async (address) => {
          try {
            const detailsArray = await goalFundFactory.getGoalFundDetails(address, false);
            if (!detailsArray || !detailsArray[0]) {
              console.warn(`No details returned for GoalFund at ${address}`);
              return null;
            }
            const details = detailsArray[0];
            return {
              contractAddress: details.contractAddress,
              name: details.name || "Unnamed Fund",
              targetAmount: ethers.formatEther(details.targetAmount || 0n),
              currentAmount: ethers.formatEther(details.currentAmount || 0n),
              deadline: Number(details.deadline || 0),
              beneficiary: details.beneficiary || ethers.ZeroAddress,
              tokenAddress: details.tokenAddress || ethers.ZeroAddress,
              fundType: Number(details.fundType || 0),
              platformFeePercentage: Number(details.platformFeePercentage || 0),
            };
          } catch (err) {
            console.error(`Error processing GoalFund at ${address}:`, err);
            return null;
          }
        })
      );
      setUserFunds(goalFundDetails.filter((fund) => fund !== null));
    } catch (error) {
      console.error("Error fetching user data:", error);
      setError("Failed to load your data. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateNavigation(path) {
    if (!account) {
      await connect();
      if (!account) return;
    }
    router.push(path);
  }

  function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  if (!account) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-4">Wallet Not Connected</h1>
          <p className="text-muted-foreground mb-6 text-sm md:text-base">
            Please connect your wallet to view your account details, pools, and funds.
          </p>
          <Button variant="outline" asChild disabled={isConnecting}>
            <Link href="/">Go to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>Loading your account data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="text-muted-foreground mb-6 text-sm md:text-base">{error}</p>
          <Button variant="outline" onClick={fetchUserData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <h1 className="text-2xl md:text-3xl font-bold mb-2">My Account</h1>
      <p className="text-muted-foreground mb-8 text-sm md:text-base">
        Manage your pools, funds, and contributions
      </p>

      {/* Wallet Overview */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">Wallet Overview</CardTitle>
          <CardDescription className="text-sm">Your account details and balance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Address</h3>
                <p className="font-mono text-xs sm:text-sm break-all">{formatAddress(account)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Balance</h3>
                <p className="text-lg md:text-xl font-bold">{parseFloat(balance).toFixed(4)} ETH</p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => handleCreateNavigation("/create/contribution")}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="mr-2 h-4 w-4" />
            )}
            Create Contriboost Pool
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => handleCreateNavigation("/create/goalfund")}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="mr-2 h-4 w-4" />
            )}
            Create GoalFund
          </Button>
        </CardFooter>
      </Card>

      {/* Tabs for different account sections */}
      <Tabs defaultValue="pools" className="w-full">
        <TabsList className="w-full mb-6 grid grid-cols-2">
          <TabsTrigger value="pools" className="text-xs sm:text-sm">
            Contriboost Pools
          </TabsTrigger>
          <TabsTrigger value="funds" className="text-xs sm:text-sm">
            GoalFunds
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pools">
          {userPools.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {userPools.map((pool) => {
                if (!ethers.isAddress(pool.contractAddress)) {
                  console.warn(`Invalid contract address for pool: ${pool.name}`);
                  return null;
                }
                return (
                  <Card key={pool.contractAddress}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base sm:text-lg">{pool.name}</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        {pool.dayRange} days per cycle
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-xs sm:text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Contribution</span>
                          <span className="font-medium">{parseFloat(pool.contributionAmount).toFixed(4)} ETH</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Participants</span>
                          <span className="font-medium">
                            {pool.currentParticipants}/{pool.expectedNumber}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Host Fee</span>
                          <span className="font-medium">{pool.hostFeePercentage / 100}%</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button variant="outline" className="w-full text-xs sm:text-sm" asChild>
                        <Link href={`/pools/details/${pool.contractAddress}`}>
                          View Details
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 border rounded-lg bg-muted/50">
              <p className="text-base sm:text-lg mb-2">No Contriboost pools found</p>
              <p className="text-muted-foreground mb-4 text-sm">
                You haven’t created or joined any Contriboost pools yet
              </p>
              <Button variant="outline" asChild className="text-xs sm:text-sm">
                <Link href="/pools">Browse Pools</Link>
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="funds">
          {userFunds.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {userFunds.map((fund) => (
                <Card key={fund.contractAddress}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base sm:text-lg">{fund.name}</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Deadline: {formatDate(fund.deadline)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target</span>
                        <span className="font-medium">{parseFloat(fund.targetAmount).toFixed(4)} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current</span>
                        <span className="font-medium">{parseFloat(fund.currentAmount).toFixed(4)} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium">
                          {fund.fundType === 0 ? "Grouped" : "Personal"}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5 mt-2">
                        <div
                          className="bg-primary h-2.5 rounded-full"
                          style={{
                            width: `${Math.min(
                              (Number(fund.currentAmount) / Number(fund.targetAmount)) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" className="w-full text-xs sm:text-sm" asChild>
                      <Link href={`/pools/details/${fund.contractAddress}`}>
                        View Details
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border rounded-lg bg-muted/50">
              <p className="text-base sm:text-lg mb-2">No GoalFunds found</p>
              <p className="text-muted-foreground mb-4 text-sm">
                You haven’t created or contributed to any GoalFunds yet
              </p>
              <Button
                variant="outline"
                className="text-xs sm:text-sm"
                onClick={() => handleCreateNavigation("/create/goalfund")}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlusCircle className="mr-2 h-4 w-4" />
                )}
                Create GoalFund
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}