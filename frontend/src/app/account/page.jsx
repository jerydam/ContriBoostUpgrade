
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
import { Loader2, PlusCircle, AlertCircle, Globe } from "lucide-react";

// Network configurations
const NETWORKS = {
  lisk: {
    chainId: 4202,
    name: "Lisk Sepolia",
    rpcUrl: "https://rpc.sepolia-api.lisk.com",
    contriboostFactory: "0x4D7D68789cbc93D33dFaFCBc87a2F6E872A5b1f8",
    goalFundFactory: "0x5842c184b44aca1D165E990af522f2a164F2abe1",
    tokenAddress: "0x46d96167DA9E15aaD148c8c68Aa1042466BA6EEd", // USDT
    tokenSymbol: "USDT",
    nativeSymbol: "ETH",
  },
  // celo: {
  //   chainId: 44787,
  //   name: "Celo Alfajores",
  //   rpcUrl: "https://alfajores-forno.celo-testnet.org",
  //   contriboostFactory: "0x8DE33AbcC5eB868520E1ceEee5137754cb3A558c",
  //   goalFundFactory: "0xDB4421c212D78bfCB4380276428f70e50881ABad",
  //   tokenAddress: "0xFE18f2C089f8fdCC843F183C5aBdeA7fa96C78a8", // cUSD
  //   tokenSymbol: "cUSD",
  //   nativeSymbol: "CELO",
  // },
};

export default function AccountPage() {
  const { provider, account, connect, isConnecting } = useWeb3();
  const [balance, setBalance] = useState({ lisk: "0" });
  const [userPools, setUserPools] = useState([]);
  const [userFunds, setUserFunds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  // Initialize providers
  const liskProvider = new ethers.JsonRpcProvider(NETWORKS.lisk.rpcUrl);
  // const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);

  useEffect(() => {
    if (account) {
      fetchUserData();
    } else {
      setIsLoading(false);
    }
  }, [account]);

  async function fetchUserData() {
    if (!account) return;

    setIsLoading(true);
    setError(null);
    const fetchedPools = [];
    const fetchedFunds = [];
    const newBalance = { lisk: "0", 
      // celo: "0" 
    };


    // Fetch data from Lisk Sepolia
    try {
      await fetchNetworkData("lisk", liskProvider, account, fetchedPools, fetchedFunds, newBalance);
    } catch (e) {
      console.error("Error fetching Lisk Sepolia data:", e);
      setError((prev) => prev ? `${prev}; Lisk Sepolia: ${e.message}` : `Lisk Sepolia: ${e.message}`);
    }

    // // Fetch data from Celo Alfajores
    // try {
    //   await fetchNetworkData("celo", celoProvider, account, fetchedPools, fetchedFunds, newBalance);
    // } catch (e) {
    //   console.error("Error fetching Celo Alfajores data:", e);
    //   setError((prev) => prev ? `${prev}; Celo Alfajores: ${e.message}` : `Celo Alfajores: ${e.message}`);
    // }

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

    // Fetch user's Contriboost pools
    const contriboostFactory = new ethers.Contract(
      networkConfig.contriboostFactory,
      ContriboostFactoryAbi,
      provider
    );
    let userContriboostAddresses = [];
    try {
      userContriboostAddresses = await contriboostFactory.getUserContriboosts(account);
    } catch (e) {
      console.warn(`Failed to fetch Contriboost addresses for ${network}:`, e);
      userContriboostAddresses = [];
    }

    const contriboostDetails = await Promise.all(
      userContriboostAddresses.map(async (address) => {
        try {
          const detailsArray = await contriboostFactory.getContriboostDetails(address, false);
          if (!detailsArray || !detailsArray[0]) {
            console.warn(`No details returned for Contriboost at ${address} on ${network}`);
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
            console.warn(`Failed to fetch active participants for ${address} on ${network}:`, err);
          }

          return {
            contractAddress: details.contractAddress,
            name: details.name || "Unnamed Pool",
            dayRange: Number(details.dayRange || 0),
            expectedNumber: Number(details.expectedNumber || 0),
            contributionAmount: ethers.formatEther(details.contributionAmount || 0n),
            hostFeePercentage: Number(details.hostFeePercentage || 0),
            currentParticipants,
            network, // Add network to identify source
            tokenSymbol: details.tokenAddress === ethers.ZeroAddress
              ? networkConfig.nativeSymbol
              : networkConfig.tokenSymbol,
          };
        } catch (err) {
          console.error(`Error processing Contriboost at ${address} on ${network}:`, err);
          return null;
        }
      })
    );

    // Fetch user's GoalFunds
    const goalFundFactory = new ethers.Contract(
      networkConfig.goalFundFactory,
      GoalFundFactoryAbi,
      provider
    );
    let userGoalFundAddresses = [];
    try {
      userGoalFundAddresses = await goalFundFactory.getUserGoalFunds(account);
    } catch (e) {
      console.warn(`Failed to fetch GoalFund addresses for ${network}:`, e);
      userGoalFundAddresses = [];
    }

    const goalFundDetails = await Promise.all(
      userGoalFundAddresses.map(async (address) => {
        try {
          const detailsArray = await goalFundFactory.getGoalFundDetails(address, false);
          if (!detailsArray || !detailsArray[0]) {
            console.warn(`No details returned for GoalFund at ${address} on ${network}`);
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
            network, // Add network to identify source
            tokenSymbol: details.tokenAddress === ethers.ZeroAddress
              ? networkConfig.nativeSymbol
              : networkConfig.tokenSymbol,
          };
        } catch (err) {
          console.error(`Error processing GoalFund at ${address} on ${network}:`, err);
          return null;
        }
      })
    );

    fetchedPools.push(...contriboostDetails.filter((pool) => pool !== null));
    fetchedFunds.push(...goalFundDetails.filter((fund) => fund !== null));
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
                  Lisk Sepolia: {parseFloat(balance.lisk).toFixed(4)} {NETWORKS.lisk.nativeSymbol}
                </p>
                {/* <p className="text-sm font-medium">
                  Celo Alfajores: {parseFloat(balance.celo).toFixed(4)} {NETWORKS.celo.nativeSymbol}
                </p> */}
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