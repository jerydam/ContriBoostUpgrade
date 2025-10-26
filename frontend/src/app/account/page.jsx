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
import { Loader2, PlusCircle, AlertCircle, Globe, CheckCircle } from "lucide-react";

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
export default function AccountPage() {
  const { provider, account, connect, isConnecting } = useWeb3();
  const [balance, setBalance] = useState({ celo: "0" });
  const [userPools, setUserPools] = useState([]);
  const [userFunds, setUserFunds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const router = useRouter();

  const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);

  useEffect(() => {
    if (account) {
      fetchUserData();
      checkVerificationStatus();
    } else {
      setIsLoading(false);
    }
  }, [account]);

  async function checkVerificationStatus() {
    if (!account) return;
    setIsCheckingVerification(true);
    try {
      const response = await fetch(`/api/verify/status/${account}`);
      const data = await response.json();
      setIsVerified(data.verified);
      if (data.verified) {
        localStorage.setItem(`verification_${account}`, "true");
      } else {
        localStorage.removeItem(`verification_${account}`);
      }
    } catch (error) {
      console.error("Error checking verification status:", error);
      setIsVerified(false);
      localStorage.removeItem(`verification_${account}`);
    } finally {
      setIsCheckingVerification(false);
    }
  }

  async function fetchUserData() {
    if (!account) return;

    setIsLoading(true);
    setError(null);
    const fetchedPools = [];
    const fetchedFunds = [];
    const newBalance = { celo: "0" };

    try {
      await fetchNetworkData("celo", celoProvider, account, fetchedPools, fetchedFunds, newBalance);
    } catch (e) {
      console.error("Error fetching Celo Alfajores data:", e);
      setError(`Celo Alfajores: ${e.message}`);
    }

    setBalance(newBalance);
    setUserPools(fetchedPools);
    setUserFunds(fetchedFunds);
    setIsLoading(false);
  }

  async function fetchNetworkData(network, provider, account, fetchedPools, fetchedFunds, newBalance) {
    const networkConfig = NETWORKS[network];

    // Fetch account balance
    try {
      const accountBalance = await provider.getBalance(account);
      newBalance[network] = ethers.formatEther(accountBalance);
    } catch (e) {
      console.warn(`Failed to fetch balance for ${network}:`, e);
      newBalance[network] = "0";
    }

    // Fetch Contriboost pools
    const contriboostFactory = new ethers.Contract(
      networkConfig.contriboostFactory,
      ContriboostFactoryAbi,
      provider
    );
    
    let userContriboostAddresses = [];
    try {
      userContriboostAddresses = await contriboostFactory.getUserContriboosts(account);
      console.log(`Found ${userContriboostAddresses.length} user Contriboost addresses`);
    } catch (e) {
      console.warn(`Failed to fetch Contriboost addresses for ${network}:`, e);
      userContriboostAddresses = [];
    }

    const contriboostDetails = await Promise.allSettled(
      userContriboostAddresses.map(async (address, index) => {
        try {
          if (!ethers.isAddress(address)) {
            console.warn(`Invalid Contriboost address at index ${index}:`, address);
            return null;
          }

          const detailsArray = await contriboostFactory.getContriboostDetails(address, false);
          if (!detailsArray || !detailsArray[0]) {
            console.warn(`No details found for Contriboost ${address}`);
            return null;
          }
          
          const details = detailsArray[0];

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
            network,
            tokenSymbol: details.tokenAddress === ethers.ZeroAddress
              ? networkConfig.nativeSymbol
              : networkConfig.tokenSymbol,
          };
        } catch (err) {
          console.error(`Error processing Contriboost at ${address}:`, err);
          return null;
        }
      })
    );

    // Process Contriboost results
    const successfulContriboostPools = contriboostDetails
      .map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          console.error(`Promise rejected for Contriboost at index ${index}:`, result.reason);
          return null;
        }
      })
      .filter((pool) => pool !== null);

    fetchedPools.push(...successfulContriboostPools);

    // Fetch GoalFund pools
    const goalFundFactory = new ethers.Contract(
      networkConfig.goalFundFactory,
      GoalFundFactoryAbi,
      provider
    );
    
    let userGoalFundAddresses = [];
    try {
      userGoalFundAddresses = await goalFundFactory.getUserGoalFunds(account);
      console.log(`Found ${userGoalFundAddresses.length} user GoalFund addresses`);
    } catch (e) {
      console.warn(`Failed to fetch GoalFund addresses for ${network}:`, e);
      userGoalFundAddresses = [];
    }

    const goalFundDetails = await Promise.allSettled(
      userGoalFundAddresses.map(async (address, index) => {
        try {
          if (!ethers.isAddress(address)) {
            console.warn(`Invalid GoalFund address at index ${index}:`, address);
            return null;
          }

          // Fixed: Use getSingleGoalFundDetails instead of getGoalFundDetails
          // and only pass the address parameter (not the second boolean parameter)
          console.log(`Fetching details for GoalFund ${address}...`);
          const details = await goalFundFactory.getSingleGoalFundDetails(address);
          
          if (!details) {
            console.warn(`No details found for GoalFund ${address}`);
            return null;
          }
          
          // The method returns the struct directly, not wrapped in an array
          console.log(`Successfully fetched details for GoalFund ${address}:`, details);
          
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
            network,
            tokenSymbol: details.tokenAddress === ethers.ZeroAddress
              ? networkConfig.nativeSymbol
              : networkConfig.tokenSymbol,
          };
        } catch (err) {
          console.error(`Error processing GoalFund at ${address}:`, err);
          return null;
        }
      })
    );

    // Process GoalFund results
    const successfulGoalFundPools = goalFundDetails
      .map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          console.error(`Promise rejected for GoalFund at index ${index}:`, result.reason);
          return null;
        }
      })
      .filter((fund) => fund !== null);

    fetchedFunds.push(...successfulGoalFundPools);
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

  function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function formatAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
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
                <p className="text-sm font-medium">
                  Celo Alfajores: {parseFloat(balance.celo).toFixed(4)} {NETWORKS.celo.nativeSymbol}
                </p>
              </div>
            </div>
            {isCheckingVerification ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Checking verification status...</span>
              </div>
            ) : isVerified ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-600 font-medium">Verified</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <span className="text-sm text-yellow-600 font-medium">Not Verified</span>
              </div>
            )}
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
          {!isVerified && (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => router.push("/verify")}
              disabled={isCheckingVerification}
            >
              {isCheckingVerification ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Verify Identity
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Tabs for different account sections */}
      <Tabs defaultValue="pools" className="w-full">
        <TabsList className="w-full mb-6 grid grid-cols-2">
          <TabsTrigger value="pools" className="text-xs sm:text-sm">
            Contriboost Pools ({userPools.length})
          </TabsTrigger>
          <TabsTrigger value="funds" className="text-xs sm:text-sm">
            GoalFunds ({userFunds.length})
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
                  <Card key={`${pool.network}-${pool.contractAddress}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base sm:text-lg">{pool.name}</CardTitle>
                      <CardDescription className="text-xs sm:text-sm flex items-center gap-1">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        {NETWORKS[pool.network].name} | {pool.dayRange} days per cycle
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-xs sm:text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Contribution</span>
                          <span className="font-medium">
                            {parseFloat(pool.contributionAmount).toFixed(4)} {pool.tokenSymbol}
                          </span>
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
                        <Link href={`/pools/details/${pool.contractAddress}?network=${pool.network}`}>
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
                You haven't created or joined any Contriboost pools yet
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
                <Card key={`${fund.network}-${fund.contractAddress}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base sm:text-lg">{fund.name}</CardTitle>
                    <CardDescription className="text-xs sm:text-sm flex items-center gap-1">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      {NETWORKS[fund.network].name} | Deadline: {formatDate(fund.deadline)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target</span>
                        <span className="font-medium">
                          {parseFloat(fund.targetAmount).toFixed(4)} {fund.tokenSymbol}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current</span>
                        <span className="font-medium">
                          {parseFloat(fund.currentAmount).toFixed(4)} {fund.tokenSymbol}
                        </span>
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
                      <Link href={`/pools/details/${fund.contractAddress}?network=${fund.network}`}>
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
                You haven't created or contributed to any GoalFunds yet
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