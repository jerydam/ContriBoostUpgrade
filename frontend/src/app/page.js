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
import { ArrowRight, ChevronRight, Coins, Wallet, Loader2 } from "lucide-react";

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
  CELO_TO_USD: 0.38, // 1 ETH = $2500
  CUSD_TO_USD: 0.9, // 1 USDT = $0.9
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
  }, []);

  // Utility to add delay between requests
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchPlatformStats() {
    setIsLoadingStats(true);
    setStatsError(null);

    // Check cache
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
          // Exponential backoff
          await delay(delayMs * Math.pow(2, i));
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

      // Normalize addresses
      const contriboostFactoryAddress = ethers.getAddress(NETWORKS.celoAlfajores.contriboostFactory);
      const goalFundFactoryAddress = ethers.getAddress(NETWORKS.celoAlfajores.goalFundFactory);
      const usdtTokenAddress = ethers.getAddress(NETWORKS.celoAlfajores.tokenAddress);

      // Fetch latest block
      const latestBlock = await retry(() => celoAlfajoresProvider.getBlockNumber());
      console.log("[STATS] Latest block:", latestBlock);

      // Fetch Contriboost contracts
      console.log("[STATS] Fetching Contriboost contracts...");
      const contriboostFactory = new ethers.Contract(
        contriboostFactoryAddress,
        ContriboostFactoryAbi,
        celoAlfajoresProvider
      );
      const contriboostAddresses = await retry(() => contriboostFactory.getContriboosts());
      console.log("[STATS] Contriboost contracts:", contriboostAddresses);

      // Process Contriboost contracts
      for (const address of contriboostAddresses) {
        console.log(`[STATS] Processing Contriboost contract: ${address}`);
        const contriboostContract = new ethers.Contract(address, ContriboostAbi, celoAlfajoresProvider);
        // Fetch token address
        let tokenAddress;
        try {
          tokenAddress = await retry(() => contriboostContract.token());
        } catch (err) {
          console.warn(`[STATS] Skipping contract ${address}: Failed to fetch token`, err);
          await delay(500);
          continue;
        }
        const isUSDT = tokenAddress.toLowerCase() === usdtTokenAddress.toLowerCase();
        console.log(`[STATS] Contriboost ${address} uses ${isUSDT ? "USDT" : "ETH"} (token: ${tokenAddress})`);

        // Query Deposit events
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

        // Delay to avoid rate limiting
        await delay(500);
      }

      // Fetch GoalFund contracts
      console.log("[STATS] Fetching GoalFund contracts...");
      const goalFundFactory = new ethers.Contract(
        goalFundFactoryAddress,
        GoalFundFactoryAbi,
        celoAlfajoresProvider
      );
      const goalFundAddresses = await retry(() => goalFundFactory.getGoalFunds());
      console.log("[STATS] GoalFund contracts:", goalFundAddresses);

      // Process GoalFund contracts
      for (const address of goalFundAddresses) {
        console.log(`[STATS] Processing GoalFund contract: ${address}`);
        const goalFundContract = new ethers.Contract(address, GoalFundAbi, celoAlfajoresProvider);
        // Fetch token address
        let tokenAddress;
        try {
          tokenAddress = await retry(() => goalFundContract.token());
        } catch (err) {
          console.warn(`[STATS] Skipping contract ${address}: Failed to fetch token`, err);
          await delay(500);
          continue;
        }
        const isUSDT = tokenAddress.toLowerCase() === usdtTokenAddress.toLowerCase();
        console.log(`[STATS] GoalFund ${address} uses ${isUSDT ? "USDT" : "ETH"} (token: ${tokenAddress})`);

        // Query Contribution events
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

        // Delay to avoid rate limiting
        await delay(500);
      }

      const newStats = {
        goalFundDeposits,
        contriboostDeposits,
        totalAmountUSD: Math.round(totalUSDAmount),
        totalUsers: uniqueUsers.size,
      };

      console.log("[STATS] Final stats:", newStats);
      // Cache results
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

  const handleSubscription = async (e) => {
    e.preventDefault();
    setSubscriptionStatus(null);
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

  const formatAddress = (address) => {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="w-full py-12 sm:py-16 md:py-24 lg:py-32 xl:py-40 bg-gradient-to-b from-background to-muted">
        <div className="container px-4 sm:px-6 md:px-8 space-y-8 sm:space-y-12 xl:space-y-16">
          <div className="grid gap-6 max-w-[90vw] sm:max-w-[1200px] mx-auto md:grid-cols-2 md:gap-8 lg:gap-12">
            <div className="flex flex-col space-y-4 order-1">
              {/* Heading */}
              <div className="order-1">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-[3.4rem] font-bold tracking-tighter leading-tight">
                  Save Together, Achieve Together
                </h1>
                <p className="max-w-[600px] text-muted-foreground text-sm sm:text-base md:text-lg lg:text-xl">
                  Create or join rotating savings pools with Contriboost, or fund your goals with GoalFund. A
                  decentralized ecosystem for community savings.
                </p>
              </div>
              {/* Buttons and How It Works (mobile) */}
              <div className="flex flex-col space-y-4 order-2 sm:order-3">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto h-10 sm:h-11 touch:min-h-[44px] text-sm sm:text-base hover:bg-[#6264c7]"
                        disabled={isConnecting}
                      >
                        Create New <span className="ml-1">+</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[90vw] max-w-[95vw] sm:max-w-md max-h-[80vh] bg-[#101b31] rounded-lg p-3 sm:p-4">
                      <DialogHeader>
                        <DialogTitle className="text-base sm:text-lg">Choose what to create</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-3 py-3">
                        <Button
                          variant="outline"
                          className="w-full justify-start h-auto py-3 text-sm sm:text-base touch:min-h-[44px]"
                          onClick={() => handleCreateNavigation("/create/contribution")}
                          disabled={isConnecting}
                        >
                          <div className="flex items-start gap-2 sm:gap-3 w-full">
                            <div className="bg-primary/10 p-1 sm:p-1.5 rounded-full flex-shrink-0">
                              <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <h3 className="font-medium text-sm sm:text-base">Contribution Pool</h3>
                              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                                Start a rotating savings pool with friends or community
                              </p>
                            </div>
                            <ChevronRight className="ml-auto h-4 w-4 sm:h-5 sm:w-5 self-center text-muted-foreground flex-shrink-0" />
                          </div>
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full justify-start h-auto py-3 text-sm sm:text-base touch:min-h-[44px]"
                          onClick={() => handleCreateNavigation("/create/goalfund")}
                          disabled={isConnecting}
                        >
                          <div className="flex items-start gap-2 sm:gap-3 w-full">
                            <div className="bg-primary/10 p-1 sm:p-1.5 rounded-full flex-shrink-0">
                              <Coins className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <h3 className="font-medium text-sm sm:text-base">GoalFund</h3>
                              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                                Create a goal-based funding campaign
                              </p>
                            </div>
                            <ChevronRight className="ml-auto h-4 w-4 sm:h-5 sm:w-5 self-center text-muted-foreground flex-shrink-0" />
                          </div>
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Link href="/pools">
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto h-10 sm:h-11 touch:min-h-[44px] text-sm sm:text-base hover:bg-[#6264c7]"
                      disabled={isConnecting}
                    >
                      Explore Contribution Pools <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                {/* How It Works (mobile only) */}
                <div className="sm:hidden">
                  <div className="relative w-full max-w-[90vw]">
                    <div className="absolute -top-8 -right-8 h-48 w-48 bg-primary/20 rounded-full blur-3xl" />
                    <div className="relative z-10 bg-card border rounded-xl shadow-lg p-4">
                      <div className="space-y-4">
                        <h3 className="text-lg font-bold">How it works</h3>
                        <ul className="space-y-3">
                          <li className="flex items-start gap-2">
                            <div className="rounded-full bg-primary/10 p-1 mt-1">
                              <span className="block h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground text-center">
                                1
                              </span>
                            </div>
                            <p className="text-xs">
                              Join a pool or create your own with predefined contribution amounts
                            </p>
                          </li>
                          <li className="flex items-start gap-2">
                            <div className="rounded-full bg-primary/10 p-1 mt-1">
                              <span className="block h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground text-center">
                                2
                              </span>
                            </div>
                            <p className="text-xs">Make regular contributions to the pool in cycles</p>
                          </li>
                          <li className="flex items-start gap-2">
                            <div className="rounded-full bg-primary/10 p-1 mt-1">
                              <span className="block h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground text-center">
                                3
                              </span>
                            </div>
                            <p className="text-xs">Each cycle, one participant receives the whole pool amount</p>
                          </li>
                          <li className="flex items-start gap-2">
                            <div className="rounded-full bg-primary/10 p-1 mt-1">
                              <span className="block h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground text-center">
                                4
                              </span>
                            </div>
                            <p className="text-xs">Earn trust and build community through transparent, secure savings</p>
                          </li>
                        </ul>
                        <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full h-10 touch:min-h-[44px] text-sm hover:bg-[#6264c7]"
                              disabled={isConnecting}
                              aria-label="Get started with Contriboost"
                            >
                              {isConnecting ? "Connecting..." : "Get Started"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="w-[90vw] max-w-[95vw] sm:max-w-md max-h-[80vh] overflow-y-auto bg-[#101b31] rounded-lg p-4">
                            <DialogHeader>
                              <DialogTitle className="text-base">
                                {isEmailVerification ? "Verify Email" : "Connect Your Wallet"}
                              </DialogTitle>
                            </DialogHeader>
                            {isEmailVerification ? (
                              <div className="grid gap-3 py-4">
                                <Input
                                  type="email"
                                  placeholder="Enter your email"
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value)}
                                  disabled
                                  className="h-10 text-sm"
                                />
                                <Input
                                  type="text"
                                  placeholder="Enter verification code"
                                  value={verificationCode}
                                  onChange={(e) => setVerificationCode(e.target.value)}
                                  className="h-10 text-sm"
                                />
                                <Button
                                  onClick={handleEmailVerification}
                                  disabled={isConnecting || !verificationCode}
                                  className="h-10 touch:min-h-[44px] text-sm"
                                >
                                  {isConnecting ? "Verifying..." : "Verify"}
                                </Button>
                              </div>
                            ) : (
                              <div className="grid gap-3 py-4">
                                <Button
                                  variant="outline"
                                  className="w-full justify-start h-auto py-3 text-sm touch:min-h-[48px]"
                                  onClick={() => handleConnect("metamask")}
                                  disabled={isConnecting}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 p-1.5 rounded-full">
                                      <Wallet className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="text-left">
                                      <h3 className="font-medium text-sm">MetaMask</h3>
                                      <p className="text-xs text-muted-foreground">
                                        Connect using your MetaMask wallet
                                      </p>
                                    </div>
                                  </div>
                                </Button>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start h-auto py-3 text-sm touch:min-h-[48px]"
                                  onClick={() => handleConnect("google")}
                                  disabled={isConnecting}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 p-1.5 rounded-full">
                                      <svg className="h-5 w-5" viewBox="0 0 24 24">
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
                                      <h3 className="font-medium text-sm">Google</h3>
                                      <p className="text-xs text-muted-foreground">
                                        Sign in with Google (Gasless Experience)
                                      </p>
                                    </div>
                                  </div>
                                </Button>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start h-auto py-3 text-sm touch:min-h-[48px]"
                                  onClick={() => handleConnect("email", { email })}
                                  disabled={isConnecting || !email}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 p-1.5 rounded-full">
                                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth="2"
                                          d="M3 8l9 6 9-6m0 10V8l-9 6-9-6v10z"
                                        />
                                      </svg>
                                    </div>
                                    <div className="text-left">
                                      <h3 className="font-medium text-sm">Email</h3>
                                      <p className="text-xs text-muted-foreground">
                                        Sign in with your email (Gasless Experience)
                                      </p>
                                    </div>
                                  </div>
                                </Button>
                                <Input
                                  type="email"
                                  placeholder="Enter email for email login"
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value)}
                                  className="h-10 text-sm"
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
              {/* Platform Statistics */}
              
                  <div className="order-3 sm:order-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-[600px]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingStats ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    ) :  statsError ? (
                      <span className="text-red-500 text-sm">Error</span>
                    ) :  (
                      <div>
                        <p className="text-xl sm:text-2xl font-bold">
                          {stats.contriboostDeposits + stats.goalFundDeposits}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Contriboost: {stats.contriboostDeposits} | GoalFund: {stats.goalFundDeposits}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingStats ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    ) : statsError ? (
                      <span className="text-red-500 text-sm">Error</span>
                    ) : (
                      <p className="text-xl sm:text-2xl font-bold">{stats.totalUsers}</p>
                    )}
                  </CardContent>
                </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {isLoadingStats ? (
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      ) : statsError ? (
                        <span className="text-red-500 text-sm">Error</span>
                      ) : (
                        <p className="text-xl sm:text-2xl font-bold">
                          ${stats.totalAmountUSD.toLocaleString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
                {statsError && (
                  <Button onClick={fetchPlatformStats} variant="outline" className="mt-4">
                    Retry Loading Stats
                  </Button>
                )}
              </div>
              {/* Wallet Connection Status */}
              {account && (
                <p className="text-xs sm:text-sm text-muted-foreground order-4">
                  Connected with {walletType === "eoa" ? "MetaMask" : "Smart Wallet"}: {formatAddress(account)}
                </p>
              )}
            </div>
            {/* How It Works (desktop) */}
            <div className="hidden sm:flex items-center justify-center order-2 md:order-2">
              <div className="relative w-full max-w-[90vw] sm:max-w-md">
                <div className="absolute -top-8 -right-8 h-48 w-48 sm:h-64 sm:w-64 bg-primary/20 rounded-full blur-3xl" />
                <div className="relative z-10 bg-card border rounded-xl shadow-lg p-4 sm:p-6 md:p-8">
                  <div className="space-y-4">
                    <h3 className="text-lg sm:text-xl font-bold">How it works</h3>
                    <ul className="space-y-3 sm:space-y-4">
                      <li className="flex items-start gap-2">
                        <div className="rounded-full bg-primary/10 p-1 mt-1">
                          <span className="block h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground text-center">
                            1
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm">
                          Join a pool or create your own with predefined contribution amounts
                        </p>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="rounded-full bg-primary/10 p-1 mt-1">
                          <span className="block h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground text-center">
                            2
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm">Make regular contributions to the pool in cycles</p>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="rounded-full bg-primary/10 p-1 mt-1">
                          <span className="block h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground text-center">
                            3
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm">Each cycle, one participant receives the whole pool amount</p>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="rounded-full bg-primary/10 p-1 mt-1">
                          <span className="block h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground text-center">
                            4
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm">Earn trust and build community through transparent, secure savings</p>
                      </li>
                    </ul>
                    <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full h-10 sm:h-11 touch:min-h-[44px] text-sm sm:text-base hover:bg-[#6264c7]"
                          disabled={isConnecting}
                          aria-label="Get started with Contriboost"
                        >
                          {isConnecting ? "Connecting..." : "Get Started"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[90vw] max-w-[95vw] sm:max-w-md max-h-[80vh] overflow-y-auto bg-[#101b31] rounded-lg p-4 sm:p-6">
                        <DialogHeader>
                          <DialogTitle className="text-base sm:text-lg">
                            {isEmailVerification ? "Verify Email" : "Connect Your Wallet"}
                          </DialogTitle>
                        </DialogHeader>
                        {isEmailVerification ? (
                          <div className="grid gap-3 sm:gap-4 py-4">
                            <Input
                              type="email"
                              placeholder="Enter your email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              disabled
                              className="h-10 sm:h-11 text-sm sm:text-base"
                            />
                            <Input
                              type="text"
                              placeholder="Enter verification code"
                              value={verificationCode}
                              onChange={(e) => setVerificationCode(e.target.value)}
                              className="h-10 sm:h-11 text-sm sm:text-base"
                            />
                            <Button
                              onClick={handleEmailVerification}
                              disabled={isConnecting || !verificationCode}
                              className="h-10 sm:h-11 touch:min-h-[44px] text-sm sm:text-base"
                            >
                              {isConnecting ? "Verifying..." : "Verify"}
                            </Button>
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:gap-4 py-4">
                            <Button
                              variant="outline"
                              className="w-full justify-start h-auto py-3 sm:py-4 text-sm sm:text-base touch:min-h-[48px]"
                              onClick={() => handleConnect("metamask")}
                              disabled={isConnecting}
                            >
                              <div className="flex items-center gap-3 sm:gap-4">
                                <div className="bg-primary/10 p-1.5 sm:p-2 rounded-full">
                                  <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                                </div>
                                <div className="text-left">
                                  <h3 className="font-medium text-sm sm:text-base">MetaMask</h3>
                                  <p className="text-xs sm:text-sm text-muted-foreground">
                                    Connect using your MetaMask wallet
                                  </p>
                                </div>
                              </div>
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full justify-start h-auto py-3 sm:py-4 text-sm sm:text-base touch:min-h-[48px]"
                              onClick={() => handleConnect("google")}
                              disabled={isConnecting}
                            >
                              <div className="flex items-center gap-3 sm:gap-4">
                                <div className="bg-primary/10 p-1.5 sm:p-2 rounded-full">
                                  <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24">
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
                                  <h3 className="font-medium text-sm sm:text-base">Google</h3>
                                  <p className="text-xs sm:text-sm text-muted-foreground">
                                    Sign in with Google (Gasless Experience)
                                  </p>
                                </div>
                              </div>
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full justify-start h-auto py-3 sm:py-4 text-sm sm:text-base touch:min-h-[48px]"
                              onClick={() => handleConnect("email", { email })}
                              disabled={isConnecting || !email}
                            >
                              <div className="flex items-center gap-3 sm:gap-4">
                                <div className="bg-primary/10 p-1.5 sm:p-2 rounded-full">
                                  <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M3 8l9 6 9-6m0 10V8l-9 6-9-6v10z"
                                    />
                                  </svg>
                                </div>
                                <div className="text-left">
                                  <h3 className="font-medium text-sm sm:text-base">Email</h3>
                                  <p className="text-xs sm:text-sm text-muted-foreground">
                                    Sign in with your email (Gasless Experience)
                                  </p>
                                </div>
                              </div>
                            </Button>
                            <Input
                              type="email"
                              placeholder="Enter email for email login"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="h-10 sm:h-11 text-sm sm:text-base"
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
      </section>

      {/* Features Section */}
      <section className="w-full py-12 sm:py-16 md:py-24 lg:py-32 bg-muted">
        <div className="container space-y-8 sm:space-y-12 px-4 sm:px-6 md:px-8">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <div className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-xs sm:text-sm text-primary">
                Platform Benefits
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter">
                Empowering Communities Through Decentralized Finance
              </h2>
              <p className="max-w-[900px] text-muted-foreground text-sm sm:text-base md:text-lg lg:text-xl">
                Contriboost combines traditional community savings practices with blockchain technology, providing
                transparency, security, and accessibility for all participants.
              </p>
            </div>
          </div>
          <div className="mx-auto grid items-start gap-6 sm:gap-8 max-w-[90vw] sm:grid-cols-2 lg:grid-cols-3 lg:max-w-[1200px]">
            <div className="grid gap-1">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold">Transparent & Secure</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                All transactions are verifiable on the blockchain, ensuring complete transparency and security for your
                funds.
              </p>
            </div>
            <div className="grid gap-1">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold">Community Driven</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Build trust within your community through regular contributions and transparent fund distributions.
              </p>
            </div>
            <div className="grid gap-1">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold">Flexible Options</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Choose between rotating savings pools or goal-based funding campaigns to meet your specific needs.
              </p>
            </div>
            <div className="grid gap-1">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold">Smart Contract Powered</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Automated distributions and contributions through secure smart contracts, eliminating intermediaries.
              </p>
            </div>
            <div className="grid gap-1">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold">Multiple Payment Options</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Use ETH or USDT for contributions, offering flexibility for all participants.
              </p>
            </div>
            <div className="grid gap-1">
              <h3 className="text-base sm:text-lg lg:text-xl font-bold">Low Fees</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Minimal platform fees with transparent host commissions, keeping more value in your community.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-12 sm:py-16 md:py-24 lg:py-32 border-t">
        <div className="container px-4 sm:px-6 md:px-8">
          <div className="grid gap-6 lg:grid-cols-[3fr,2fr] lg:gap-8 xl:gap-12 max-w-[90vw] sm:max-w-[1200px] mx-auto">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter">
                  Ready to start your savings journey?
                </h2>
                <p className="max-w-[600px] text-muted-foreground text-sm sm:text-base md:text-lg lg:text-xl">
                  Join Contriboost today and experience the power of community-driven savings and funding.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto h-10 sm:h-11 touch:min-h-[44px] text-sm sm:text-base hover:bg-[#6264c7]"
                      disabled={isConnecting}
                    >
                      Get Started
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[90vw] max-w-[95vw] sm:max-w-md max-h-[80vh] overflow-y-auto bg-[#101b31] rounded-lg p-4 sm:p-6">
                    <DialogHeader>
                      <DialogTitle className="text-base sm:text-lg">Choose what to create</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <Button
                        variant="outline"
                        className="w-full justify-start h-auto py-3 sm:py-4 text-sm sm:text-base touch:min-h-[48px]"
                        onClick={() => handleCreateNavigation("/create/contribution")}
                        disabled={isConnecting}
                      >
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="bg-primary/10 p-1.5 sm:p-2 rounded-full">
                            <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                          </div>
                          <div className="text-left">
                            <h3 className="font-medium text-sm sm:text-base">Create Contribution Pool</h3>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Start a rotating savings pool with friends or community
                            </p>
                          </div>
                          <ChevronRight className="ml-auto h-4 w-4 sm:h-5 sm:w-5 self-center text-muted-foreground" />
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start h-auto py-3 sm:py-4 text-sm sm:text-base touch:min-h-[48px]"
                        onClick={() => handleCreateNavigation("/create/goalfund")}
                        disabled={isConnecting}
                      >
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="bg-primary/10 p-1.5 sm:p-2 rounded-full">
                            <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                          </div>
                          <div className="text-left">
                            <h3 className="font-medium text-sm sm:text-base">Create GoalFund</h3>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Create a goal-based funding campaign
                            </p>
                          </div>
                          <ChevronRight className="ml-auto h-4 w-4 sm:h-5 sm:w-5 self-center text-muted-foreground" />
                        </div>
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Link href="/pools">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto h-10 sm:h-11 touch:min-h-[44px] text-sm sm:text-base hover:bg-[#6264c7]"
                    disabled={isConnecting}
                  >
                    Explore Pools
                  </Button>
                </Link>
              </div>
            </div>
            <div className="flex flex-col justify-center space-y-4 rounded-xl border bg-card p-4 sm:p-6">
              <div className="space-y-2">
                <h3 className="text-lg sm:text-xl font-bold">Subscribe to updates</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Stay informed about new features and community events.
                </p>
              </div>
              <form className="flex flex-col sm:flex-row gap-2 sm:gap-3" onSubmit={handleSubscription}>
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10 sm:h-11 text-sm sm:text-base"
                />
                <Button
                  variant="outline"
                  type="submit"
                  className="w-full sm:w-auto h-10 sm:h-11 touch:min-h-[44px] text-sm sm:text-base hover:bg-[#6264c7]"
                >
                  Subscribe
                </Button>
              </form>
              {subscriptionStatus && (
                <p className={`text-xs sm:text-sm ${subscriptionStatus === "success" ? "text-green-600" : "text-red-600"}`}>
                  {subscriptionMessage}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                By subscribing, you agree to our terms and privacy policy.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}