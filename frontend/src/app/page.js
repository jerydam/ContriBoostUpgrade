"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import { ContriboostFactoryAbi, ContriboostAbi, GoalFundFactoryAbi, GoalFundAbi } from "@/lib/contractabi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowRight, ChevronRight, Coins, Wallet, Loader2, CheckCircle } from "lucide-react";

// Network configurations
const NETWORKS = {
  celoAlfajores: {
    chainId: 44787,
    name: "celoAlfajores",
    rpcUrl: "https://alfajores-forno.celo-testnet.org",
    contriboostFactory: "0x8DE33AbcC5eB868520E1ceEee5137754cb3A558c",
    goalFundFactory: "0xDB4421c212D78bfCB4380276428f70e50881ABad",
    tokenAddress: "0xFE18f2C089f8fdCC843F183C5aBdeA7fa96C78a8", // USDT
    celo: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
    tokenSymbol: "USDT",
    nativeSymbol: "ETH",
  },
};

// Static conversion rates
const CONVERSION_RATES = {
  CELO_TO_USD: 0.38,
  CUSD_TO_USD: 0.9,
};

// Cache configuration
const CACHE_KEY = "platform_stats";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export default function LandingPage() {
  const { account, walletType, connect, connectInAppWallet, isConnecting, provider } = useWeb3();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");
  const [isEmailVerification, setIsEmailVerification] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [stats, setStats] = useState({
    goalFundDeposits: 0,
    contriboostDeposits: 0,
    totalAmountUSD: 0,
    totalUsers: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const router = useRouter();

  useEffect(() => {
    fetchPlatformStats();
    if (account) {
      checkVerificationStatus();
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

  async function fetchPlatformStats() {
    setIsLoadingStats(true);
    setStatsError(null);

    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      const { data, timestamp } = JSON.parse(cachedData);
      if (Date.now() - timestamp < CACHE_DURATION) {
        console.log("[STATS] Using cached data:", data);
        setStats(data);
        setIsLoadingStats(false);
        return;
      }
    }

    const retry = async (fn, retries = 3, delayMs = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (err) {
          console.warn(`[RETRY] Attempt ${i + 1} failed:`, err.message);
          if (i === retries - 1) throw err;
          await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, i)));
        }
      }
    };

    try {
      console.log("[STATS] Initializing stats fetch...");
      const celoAlfajoresProvider = new ethers.JsonRpcProvider(NETWORKS.celoAlfajores.rpcUrl);
      let goalFundDeposits = 0;
      let contriboostDeposits = 0;
      let totalUSDAmount = 0;
      const uniqueUsers = new Set();

      const contriboostFactoryAddress = ethers.getAddress(NETWORKS.celoAlfajores.contriboostFactory);
      const goalFundFactoryAddress = ethers.getAddress(NETWORKS.celoAlfajores.goalFundFactory);
      const usdtTokenAddress = ethers.getAddress(NETWORKS.celoAlfajores.tokenAddress);

      const latestBlock = await retry(() => celoAlfajoresProvider.getBlockNumber());
      console.log("[STATS] Latest block:", latestBlock);

      const contriboostFactory = new ethers.Contract(
        contriboostFactoryAddress,
        ContriboostFactoryAbi,
        celoAlfajoresProvider
      );
      const contriboostAddresses = await retry(() => contriboostFactory.getContriboosts());
      console.log("[STATS] Contriboost contracts:", contriboostAddresses);

      for (const address of contriboostAddresses) {
        console.log(`[STATS] Processing Contriboost contract: ${address}`);
        const contriboostContract = new ethers.Contract(address, ContriboostAbi, celoAlfajoresProvider);
        let tokenAddress;
        try {
          tokenAddress = await retry(() => contriboostContract.token());
        } catch (err) {
          console.warn(`[STATS] Skipping contract ${address}: Failed to fetch token`, err);
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        const isUSDT = tokenAddress.toLowerCase() === usdtTokenAddress.toLowerCase();
        console.log(`[STATS] Contriboost ${address} uses ${isUSDT ? "USDT" : "ETH"} (token: ${tokenAddress})`);

        try {
          const depositFilter = contriboostContract.filters.Deposit(null, null);
          const depositEvents = await retry(() =>
            contriboostContract.queryFilter(depositFilter, 0, latestBlock)
          );
          console.log(`[STATS] Found ${depositEvents.length} Deposit events for ${address}`);
          contriboostDeposits += depositEvents.length;
          for (const event of depositEvents) {
            const amount = BigInt(event.args.amount.toString());
            const user = event.args.participant.toLowerCase();
            uniqueUsers.add(user);
            const usdValue = isUSDT
              ? Number(ethers.formatUnits(amount, 6)) * CONVERSION_RATES.CUSD_TO_USD
              : Number(ethers.formatEther(amount)) * CONVERSION_RATES.CELO_TO_USD;
            totalUSDAmount += usdValue;
            console.log(
              `[STATS] Deposit event: user=${user}, amount=${
                isUSDT ? ethers.formatUnits(amount, 6) : ethers.formatEther(amount)
              } ${isUSDT ? "USDT" : "ETH"}, USD=${usdValue.toFixed(2)}`
            );
          }
        } catch (err) {
          console.warn(`[STATS] Failed to query Deposit events for ${address}:`, err);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const goalFundFactory = new ethers.Contract(
        goalFundFactoryAddress,
        GoalFundFactoryAbi,
        celoAlfajoresProvider
      );
      const goalFundAddresses = await retry(() => goalFundFactory.getGoalFunds());
      console.log("[STATS] GoalFund contracts:", goalFundAddresses);

      for (const address of goalFundAddresses) {
        console.log(`[STATS] Processing GoalFund contract: ${address}`);
        const goalFundContract = new ethers.Contract(address, GoalFundAbi, celoAlfajoresProvider);
        let tokenAddress;
        try {
          tokenAddress = await retry(() => goalFundContract.token());
        } catch (err) {
          console.warn(`[STATS] Skipping contract ${address}: Failed to fetch token`, err);
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        const isUSDT = tokenAddress.toLowerCase() === usdtTokenAddress.toLowerCase();
        console.log(`[STATS] GoalFund ${address} uses ${isUSDT ? "USDT" : "ETH"} (token: ${tokenAddress})`);

        try {
          const contributionFilter = goalFundContract.filters.Contribution(null, null);
          const contributionEvents = await retry(() =>
            goalFundContract.queryFilter(contributionFilter, 0, latestBlock)
          );
          console.log(`[STATS] Found ${contributionEvents.length} Contribution events for ${address}`);
          goalFundDeposits += contributionEvents.length;
          for (const event of contributionEvents) {
            const amount = BigInt(event.args.amount.toString());
            const user = event.args.contributor.toLowerCase();
            uniqueUsers.add(user);
            const usdValue = isUSDT
              ? Number(ethers.formatUnits(amount, 6)) * CONVERSION_RATES.CUSD_TO_USD
              : Number(ethers.formatEther(amount)) * CONVERSION_RATES.CELO_TO_USD;
            totalUSDAmount += usdValue;
            console.log(
              `[STATS] Contribution event: contributor=${user}, amount=${
                isUSDT ? ethers.formatUnits(amount, 6) : ethers.formatEther(amount)
              } ${isUSDT ? "USDT" : "ETH"}, USD=${usdValue.toFixed(2)}`
            );
          }
        } catch (err) {
          console.warn(`[STATS] Failed to query Contribution events for ${address}:`, err);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const newStats = {
        goalFundDeposits,
        contriboostDeposits,
        totalAmountUSD: Math.round(totalUSDAmount),
        totalUsers: uniqueUsers.size,
      };

      console.log("[STATS] Final stats:", newStats);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: newStats, timestamp: Date.now() }));
      setStats(newStats);
    } catch (err) {
      console.error("[STATS] Error fetching platform stats:", err);
      setStatsError("Failed to load platform statistics. Please try again later.");
    } finally {
      setIsLoadingStats(false);
    }
  }

  const handleCreateNavigation = async (path) => {
    setIsCreateDialogOpen(false);
    if (!account) {
      setIsConnectDialogOpen(true);
    } else {
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
  };

  const handleConnect = async (connectorId, options = {}) => {
    try {
      if (connectorId === "metamask") {
        await connect();
        setIsConnectDialogOpen(false);
      } else {
        const result = await connectInAppWallet(connectorId, options);
        if (result && result.preAuth) {
          setIsEmailVerification(true);
          setIsConnectDialogOpen(true);
        } else {
          setIsConnectDialogOpen(false);
          setEmail("");
          setVerificationCode("");
        }
      }
    } catch (error) {
      console.error("[WALLET] Connection failed:", error);
    }
  };

  const handleEmailVerification = async () => {
    try {
      await connectInAppWallet("email", { email, verificationCode });
      setIsConnectDialogOpen(false);
      setIsEmailVerification(false);
      setEmail("");
      setVerificationCode("");
    } catch (error) {
      console.error("[WALLET] Verification failed:", error);
    }
  };

  const handleSubscription = async () => {
    setSubscriptionStatus(null);
    if (!email) return;
    try {
      console.log("[SUBSCRIPTION] Submitting email:", email);
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("Failed to subscribe");
      const data = await response.json();
      setSubscriptionStatus("success");
      setSubscriptionMessage("Thank you for subscribing!");
      setEmail("");
      console.log("[SUBSCRIPTION] Success:", data);
    } catch (error) {
      console.error("[SUBSCRIPTION] Failed:", error);
      setSubscriptionStatus("error");
      setSubscriptionMessage("Failed to subscribe. Please try again.");
    }
  };

  const handleVerifyNavigation = () => {
    setIsConnectDialogOpen(false);
    router.push("/verify");
  };

  const formatAddress = (address) => {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-8 sm:py-12 md:py-16 lg:py-24 xl:py-32 bg-gradient-to-b from-background to-muted">
        <div className="container px-4 sm:px-6 md:px-8 mx-auto">
          <div className="max-w-7xl mx-auto">
            <div className="grid gap-8 lg:gap-12 xl:gap-16 lg:grid-cols-2 items-center">
              {/* Content Column */}
              <div className="flex flex-col space-y-6 lg:space-y-8">
                {/* Heading */}
                <div className="space-y-4">
                  <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-tight">
                    Save Together,
                    <br className="hidden sm:block" />
                    <span className="text-primary">Achieve Together</span>
                  </h1>
                  <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-2xl">
                    Create or join rotating savings pools with Contriboost, or fund your goals with GoalFund. A
                    decentralized ecosystem for community savings.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        size="lg"
                        className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-medium"
                        disabled={isConnecting}
                      >
                        {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create New Pool
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] max-w-md mx-auto bg-[#101b31] rounded-lg">
                      <DialogHeader>
                        <DialogTitle className="text-lg sm:text-xl">Choose what to create</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <Button
                          variant="outline"
                          className="w-full justify-start h-auto py-4 text-left"
                          onClick={() => handleCreateNavigation("/create/contribution")}
                          disabled={isConnecting}
                        >
                          <div className="flex items-start gap-4 w-full">
                            <div className="bg-primary/10 p-2 rounded-full flex-shrink-0">
                              <Wallet className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-sm sm:text-base">Contribution Pool</h3>
                              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                                Start a rotating savings pool with friends or community
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          </div>
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full justify-start h-auto py-4 text-left"
                          onClick={() => handleCreateNavigation("/create/goalfund")}
                          disabled={isConnecting}
                        >
                          <div className="flex items-start gap-4 w-full">
                            <div className="bg-primary/10 p-2 rounded-full flex-shrink-0">
                              <Coins className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-sm sm:text-base">GoalFund</h3>
                              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                                Create a goal-based funding campaign
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          </div>
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Link href="/pools" className="w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-medium"
                      disabled={isConnecting}
                    >
                      Explore Pools
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                {/* Platform Statistics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
                  <Card className="border-0 bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Transactions</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {isLoadingStats ? (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : statsError ? (
                        <span className="text-red-500 text-sm">Error</span>
                      ) : (
                        <div>
                          <p className="text-2xl sm:text-3xl font-bold">
                            {stats.contriboostDeposits + stats.goalFundDeposits}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Pools: {stats.contriboostDeposits} | Funds: {stats.goalFundDeposits}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card className="border-0 bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {isLoadingStats ? (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : statsError ? (
                        <span className="text-red-500 text-sm">Error</span>
                      ) : (
                        <p className="text-2xl sm:text-3xl font-bold">{stats.totalUsers}</p>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card className="border-0 bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Volume</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {isLoadingStats ? (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : statsError ? (
                        <span className="text-red-500 text-sm">Error</span>
                      ) : (
                        <p className="text-2xl sm:text-3xl font-bold">
                          ${stats.totalAmountUSD.toLocaleString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Wallet Connection Status */}
                {account && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Connected: {formatAddress(account)}</span>
                    {isVerified && (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>Verified</span>
                      </div>
                    )}
                  </div>
                )}

                {statsError && (
                  <Button 
                    onClick={fetchPlatformStats} 
                    variant="outline" 
                    size="sm"
                    className="w-fit"
                  >
                    Retry Loading Stats
                  </Button>
                )}
              </div>

              {/* How It Works Card */}
              <div className="flex items-center justify-center lg:justify-end">
                <div className="relative w-full max-w-md">
                  <div className="absolute -top-8 -right-8 h-32 w-32 sm:h-48 sm:w-48 lg:h-64 lg:w-64 bg-primary/20 rounded-full blur-3xl" />
                  <div className="relative z-10 bg-card border rounded-2xl shadow-xl p-6 sm:p-8">
                    <div className="space-y-6">
                      <h3 className="text-xl sm:text-2xl font-bold">How it works</h3>
                      <ul className="space-y-4">
                        {[
                          "Join a pool or create your own with predefined contribution amounts",
                          "Make regular contributions to the pool in cycles", 
                          "Each cycle, one participant receives the whole pool amount",
                          "Earn trust and build community through transparent, secure savings"
                        ].map((text, index) => (
                          <li key={index} className="flex items-start gap-3">
                            <div className="rounded-full bg-primary/10 p-1.5 mt-0.5 flex-shrink-0">
                              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                {index + 1}
                              </span>
                            </div>
                            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                              {text}
                            </p>
                          </li>
                        ))}
                      </ul>
                      
                      <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            className="w-full h-12 text-base font-medium"
                            disabled={isConnecting || isCheckingVerification}
                          >
                            {isCheckingVerification ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              "Get Started"
                            )}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[95vw] max-w-md mx-auto bg-[#101b31] rounded-lg">
                          <DialogHeader>
                            <DialogTitle className="text-lg">
                              {account && !isVerified
                                ? "Verify Your Identity"
                                : isEmailVerification
                                ? "Verify Email"
                                : "Connect Your Wallet"}
                            </DialogTitle>
                          </DialogHeader>
                          
                          {account && !isVerified ? (
                            <div className="space-y-4 py-4">
                              <p className="text-sm text-muted-foreground">
                                Identity verification is required to create or join Contriboost pools.
                              </p>
                              <Button
                                onClick={handleVerifyNavigation}
                                className="w-full h-12"
                              >
                                Verify Identity
                              </Button>
                            </div>
                          ) : isEmailVerification ? (
                            <div className="space-y-4 py-4">
                              <Input
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled
                                className="h-12"
                              />
                              <Input
                                type="text"
                                placeholder="Enter verification code"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value)}
                                className="h-12"
                              />
                              <Button
                                onClick={handleEmailVerification}
                                disabled={isConnecting || !verificationCode}
                                className="w-full h-12"
                              >
                                {isConnecting ? "Verifying..." : "Verify"}
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-4 py-4">
                              <Button
                                variant="outline"
                                className="w-full justify-start h-auto py-4"
                                onClick={() => handleConnect("metamask")}
                                disabled={isConnecting}
                              >
                                <div className="flex items-center gap-4">
                                  <div className="bg-primary/10 p-2 rounded-full">
                                    <Wallet className="h-6 w-6 text-primary" />
                                  </div>
                                  <div className="text-left">
                                    <h3 className="font-medium">MetaMask</h3>
                                    <p className="text-sm text-muted-foreground">
                                      Connect using your MetaMask wallet
                                    </p>
                                  </div>
                                </div>
                              </Button>
                              
                              <Button
                                variant="outline"
                                className="w-full justify-start h-auto py-4"
                                onClick={() => handleConnect("google")}
                                disabled={isConnecting}
                              >
                                <div className="flex items-center gap-4">
                                  <div className="bg-primary/10 p-2 rounded-full">
                                    <svg className="h-6 w-6" viewBox="0 0 24 24">
                                      <path
                                        fill="#4285F4"
                                        d="M22.56 12.25c0-.78-.07-1.53-.20-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                      />
                                      <path
                                        fill="#34A853"
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1.04 .69-2.37 1.10-3.71 1.10-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C4.01 20.52 7.69 23 12 23z"
                                      />
                                      <path
                                        fill="#FBBC05"
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43 .35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22 .81-.62z"
                                      />
                                      <path
                                        fill="#EA4335"
                                        d="M12 5.38c1.62 0 3.06 .56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.69 1 4.01 3.48 2.18 7.07l3.66 2.84c .87-2.60 3.30-4.53 6.16-4.53z"
                                      />
                                    </svg>
                                  </div>
                                  <div className="text-left">
                                    <h3 className="font-medium">Google</h3>
                                    <p className="text-sm text-muted-foreground">
                                      Sign in with Google (Gasless)
                                    </p>
                                  </div>
                                </div>
                              </Button>
                              
                              <Button
                                variant="outline"
                                className="w-full justify-start h-auto py-4"
                                onClick={() => handleConnect("email", { email })}
                                disabled={isConnecting || !email}
                              >
                                <div className="flex items-center gap-4">
                                  <div className="bg-primary/10 p-2 rounded-full">
                                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M3 8l9 6 9-6m0 10V8l-9 6-9-6v10z"
                                      />
                                    </svg>
                                  </div>
                                  <div className="text-left">
                                    <h3 className="font-medium">Email</h3>
                                    <p className="text-sm text-muted-foreground">
                                      Sign in with email (Gasless)
                                    </p>
                                  </div>
                                </div>
                              </Button>
                              
                              <Input
                                type="email"
                                placeholder="Enter email for email login"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-12"
                              />
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-12 sm:py-16 md:py-24 lg:py-32 bg-muted/30">
        <div className="container px-4 sm:px-6 md:px-8 mx-auto">
          <div className="max-w-7xl mx-auto space-y-12 lg:space-y-16">
            <div className="text-center space-y-4 max-w-3xl mx-auto">
              <div className="inline-block rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                Platform Benefits
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                Empowering Communities Through
                <span className="block text-primary">Decentralized Finance</span>
              </h2>
              <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
                Contriboost combines traditional community savings practices with blockchain technology, providing
                transparency, security, and accessibility for all participants.
              </p>
            </div>
            
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Transparent & Secure",
                  description: "All transactions are verifiable on the blockchain, ensuring complete transparency and security for your funds."
                },
                {
                  title: "Community Driven", 
                  description: "Build trust within your community through regular contributions and transparent fund distributions."
                },
                {
                  title: "Flexible Options",
                  description: "Choose between rotating savings pools or goal-based funding campaigns to meet your specific needs."
                },
                {
                  title: "Smart Contract Powered",
                  description: "Automated distributions and contributions through secure smart contracts, eliminating intermediaries."
                },
                {
                  title: "Multiple Payment Options",
                  description: "Use ETH or USDT for contributions, offering flexibility for all participants."
                },
                {
                  title: "Low Fees",
                  description: "Minimal platform fees with transparent host commissions, keeping more value in your community."
                }
              ].map((feature, index) => (
                <div key={index} className="space-y-3 p-6 bg-card rounded-xl border">
                  <h3 className="text-xl font-bold">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-12 sm:py-16 md:py-24 lg:py-32 border-t">
        <div className="container px-4 sm:px-6 md:px-8 mx-auto">
          <div className="max-w-7xl mx-auto">
            <div className="grid gap-8 lg:grid-cols-[1fr,400px] lg:gap-12 xl:gap-16 items-center">
              <div className="space-y-6 lg:space-y-8">
                <div className="space-y-4">
                  <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                    Ready to start your
                    <span className="block text-primary">savings journey?</span>
                  </h2>
                  <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl">
                    Join Contriboost today and experience the power of community-driven savings and funding.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        size="lg"
                        className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-medium"
                        disabled={isConnecting}
                      >
                        Get Started
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] max-w-md mx-auto bg-[#101b31] rounded-lg">
                      <DialogHeader>
                        <DialogTitle className="text-lg">Choose what to create</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <Button
                          variant="outline"
                          className="w-full justify-start h-auto py-4"
                          onClick={() => handleCreateNavigation("/create/contribution")}
                          disabled={isConnecting}
                        >
                          <div className="flex items-start gap-4 w-full">
                            <div className="bg-primary/10 p-2 rounded-full">
                              <Wallet className="h-5 w-5 text-primary" />
                            </div>
                            <div className="text-left flex-1">
                              <h3 className="font-medium">Create Contribution Pool</h3>
                              <p className="text-sm text-muted-foreground">
                                Start a rotating savings pool with friends or community
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full justify-start h-auto py-4"
                          onClick={() => handleCreateNavigation("/create/goalfund")}
                          disabled={isConnecting}
                        >
                          <div className="flex items-start gap-4 w-full">
                            <div className="bg-primary/10 p-2 rounded-full">
                              <Coins className="h-5 w-5 text-primary" />
                            </div>
                            <div className="text-left flex-1">
                              <h3 className="font-medium">Create GoalFund</h3>
                              <p className="text-sm text-muted-foreground">
                                Create a goal-based funding campaign
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  
                  <Link href="/pools" className="w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-medium"
                      disabled={isConnecting}
                    >
                      Explore Pools
                    </Button>
                  </Link>
                </div>
              </div>
              
              {/* Newsletter Signup */}
              <div className="bg-card border rounded-2xl p-6 sm:p-8 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-xl sm:text-2xl font-bold">Subscribe to updates</h3>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Stay informed about new features and community events.
                  </p>
                </div>
                
                <div className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12"
                  />
                  <Button
                    onClick={handleSubscription}
                    disabled={!email}
                    className="w-full h-12 font-medium"
                  >
                    Subscribe
                  </Button>
                </div>
                
                {subscriptionStatus && (
                  <p className={`text-sm ${subscriptionStatus === "success" ? "text-green-600" : "text-red-600"}`}>
                    {subscriptionMessage}
                  </p>
                )}
                
                <p className="text-xs text-muted-foreground">
                  By subscribing, you agree to our terms and privacy policy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}