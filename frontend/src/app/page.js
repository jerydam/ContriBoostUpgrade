"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { StatTile, StatTileRow } from "@/components/dashboard/stat-tile";
import { ArrowRight, ChevronRight, Coins, Wallet, Layers, Target, Users } from "lucide-react";
import { useWeb3 } from "@/components/providers/web3-provider";
import { useMiniApp } from "@/components/providers/miniapp-provider";
import { NestoraFactoryAbi, SavingsFactoryAbi } from "@/lib/contractabi";

import {
  RPC_URL,
  NESTORA_FACTORY_ADDRESS as Nestora_FACTORY_ADDRESS,
  SAVINGS_FACTORY_ADDRESS as SAVING_FACTORY_ADDRESS,
  getTokenSymbol,
} from "@/lib/chain-config";

function GetStartedButton({
  isMiniApp,
  account,
  isConnecting,
  onMainCta,
  isConnectDialogOpen,
  setIsConnectDialogOpen,
  onConnect,
  ResponsiveDialogContent,
}) {
  if (isMiniApp) {
    return (
      <Button variant="default" className="w-full" disabled={isConnecting} onClick={onMainCta}>
        {isConnecting ? "Connecting..." : account ? "Create New" : "Connect Wallet"}
      </Button>
    );
  }

  return (
    <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="w-full" disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Get Started"}
        </Button>
      </DialogTrigger>

      <ResponsiveDialogContent title="Connect Wallet">
        <div className="grid gap-4">
          <Button onClick={() => onConnect("injected")} variant="outline" className="h-12 justify-start">
            MetaMask / Injected
          </Button>
        </div>
      </ResponsiveDialogContent>
    </Dialog>
  );
}

export default function LandingPage() {
  const { account, connect, isConnecting } = useWeb3();
  const { isMiniApp } = useMiniApp();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");
  const [liveStatsState, setLiveStatsState] = useState("loading"); // loading | ready | error
  const [liveStats, setLiveStats] = useState(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function fetchLiveStats() {
      try {
        const readProvider = new ethers.JsonRpcProvider(RPC_URL);
        const NestoraFactory = new ethers.Contract(
          Nestora_FACTORY_ADDRESS,
          NestoraFactoryAbi,
          readProvider
        );
        const goalFundFactory = new ethers.Contract(
          SAVING_FACTORY_ADDRESS,
          SavingsFactoryAbi,
          readProvider
        );

        const [NestoraDetailsRaw, goalFundDetailsRaw] = await Promise.all([
          NestoraFactory.getAllNestorasDetails(),
          goalFundFactory.getAllSavingsDetails(),
        ]);

        const groupedGoalFunds = goalFundDetailsRaw.filter((f) => Number(f.fundType) === 0);
        const totalSeats = NestoraDetailsRaw.reduce(
          (sum, p) => sum + Number(p.expectedNumber || 0),
          0
        );
        const avgGroupSize =
          NestoraDetailsRaw.length > 0
            ? Math.round(totalSeats / NestoraDetailsRaw.length)
            : 0;
        const previewPools = NestoraDetailsRaw.slice(0, 3).map((p) => ({
          name: p.name || "Unnamed Pool",
          contributionAmount: ethers.formatEther(p.contributionAmount || 0n),
          tokenAddress: p.tokenAddress,
          dayRange: Number(p.dayRange || 0),
        }));

        if (!cancelled) {
          setLiveStats({
            NestoraCount: NestoraDetailsRaw.length,
            goalFundCount: groupedGoalFunds.length,
            totalSeats,
            avgGroupSize,
            previewPools,
          });
          setLiveStatsState("ready");
        }
      } catch (err) {
        console.error("Failed to fetch live platform stats:", err);
        if (!cancelled) setLiveStatsState("error");
      }
    }

    fetchLiveStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateNavigation = (path) => {
    setIsCreateDialogOpen(false);
    if (!account) {
      if (isMiniApp) {
        // Connect directly in miniapp
        connect();
      } else {
        setIsConnectDialogOpen(true);
      }
    } else {
      router.push(path);
    }
  };

  const handleConnect = async (connectorId) => {
    setIsConnectDialogOpen(false);
    await connect(connectorId);
  };

  const handleMainCta = () => {
    if (isMiniApp) {
      if (!account) {
        connect();
      } else {
        setIsCreateDialogOpen(true);
      }
    } else {
      setIsConnectDialogOpen(true);
    }
  };

  const handleSubscription = async (e) => {
    e.preventDefault();
    setSubscriptionStatus(null);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("Failed to subscribe");
      setSubscriptionStatus("success");
      setSubscriptionMessage("Thank you for subscribing!");
      setEmail("");
    } catch (error) {
      setSubscriptionStatus("error");
      setSubscriptionMessage("Failed to subscribe. Please try again.");
    }
  };

  const ResponsiveDialogContent = ({ children, title }) => (
    <DialogContent
      className={`
        w-full max-w-full mx-auto p-4 sm:p-6
        sm:max-w-md md:max-w-lg lg:max-w-xl
        overflow-y-auto max-h-[80vh]
        bg-card text-card-foreground backdrop-blur-lg border
      `}
    >
      <DialogHeader>
        <DialogTitle className="text-lg sm:text-xl">{title}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 py-4">{children}</div>
    </DialogContent>
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* ==================== HERO SECTION ==================== */}
      <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-linear-to-b from-background to-muted">
        <div className="container px-4 md:px-6 space-y-10 xl:space-y-16">
          <div className="grid gap-8 max-w-[1300px] mx-auto md:grid-cols-2 md:gap-12">
            {/* LEFT: Text & Actions */}
            <div className="flex flex-col justify-center space-y-4">
              <h1 className="lg:leading-tighter text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl xl:text-[3.4rem] 2xl:text-[3.75rem]">
                Save Together, <br className="hidden sm:inline" /> Achieve Together
              </h1>
              <p className="max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Create or join rotating savings pools with Nestora, or fund your goals with GoalFund. A
                decentralized ecosystem for community savings.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                {/* CREATE DIALOG */}
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="default"
                      size="lg"
                      className="w-full sm:w-auto"
                      disabled={isConnecting}
                    >
                      Create New <span className="ml-1">+</span>
                    </Button>
                  </DialogTrigger>

                  <ResponsiveDialogContent title="Choose what to create">
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-4 text-left"
                      onClick={() => handleCreateNavigation("/create/contribution")}
                    >
                      <div className="flex items-start gap-4">
                        <div className="bg-primary/10 p-2 rounded-full">
                          <Wallet className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">Create Contribution Pool</h3>
                          <p className="text-sm text-muted-foreground">
                            Start a rotating savings pool with friends
                          </p>
                        </div>
                        <ChevronRight className="ml-auto h-5 w-5 self-center text-muted-foreground" />
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-4 text-left"
                      onClick={() => handleCreateNavigation("/create/goalfund")}
                    >
                      <div className="flex items-start gap-4">
                        <div className="bg-primary/10 p-2 rounded-full">
                          <Coins className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">Create GoalFund</h3>
                          <p className="text-sm text-muted-foreground">
                            Create a goal-based funding campaign
                          </p>
                        </div>
                        <ChevronRight className="ml-auto h-5 w-5 self-center text-muted-foreground" />
                      </div>
                    </Button>
                  </ResponsiveDialogContent>
                </Dialog>

                {/* EXPLORE POOLS */}
                <Link href="/pools">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={isConnecting}
                  >
                    Explore Contribution Pools <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>

                {/* PAY BILLS */}
                <Link href="/bills">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    Pay Bills
                  </Button>
                </Link>
              </div>

              {account && (
                <p className="text-sm text-muted-foreground font-numeric">
                  Connected: {account.slice(0, 6)}...{account.slice(-4)}
                  {isMiniApp && <span className="ml-2 font-sans text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">Farcaster</span>}
                </p>
              )}
            </div>

            {/* RIGHT: Live Dashboard Preview */}
            <div className="flex items-center justify-center">
              {liveStatsState === "error" ? (
                <div className="relative w-full max-w-md">
                  <div className="absolute -top-10 -right-10 h-72 w-72 bg-primary/20 rounded-full blur-3xl" />
                  <div className="relative z-10 bg-card border rounded-xl shadow-lg p-6 md:p-10">
                    <div className="space-y-4">
                      <h3 className="text-xl font-bold">How it works</h3>
                      <ul className="space-y-4">
                        {[
                          "Join a pool or create your own with predefined contribution amounts",
                          "Make regular contributions to the pool in cycles",
                          "Each cycle, one participant receives the whole pool amount",
                          "Earn trust and build community through transparent, secure savings",
                        ].map((text, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <div className="rounded-full bg-primary/10 p-1 mt-1">
                              <span className="block h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground text-center leading-4">
                                {i + 1}
                              </span>
                            </div>
                            <p className="text-sm">{text}</p>
                          </li>
                        ))}
                      </ul>
                      <GetStartedButton
                        isMiniApp={isMiniApp}
                        account={account}
                        isConnecting={isConnecting}
                        onMainCta={handleMainCta}
                        isConnectDialogOpen={isConnectDialogOpen}
                        setIsConnectDialogOpen={setIsConnectDialogOpen}
                        onConnect={handleConnect}
                        ResponsiveDialogContent={ResponsiveDialogContent}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-md space-y-4">
                  <BalanceCard
                    label="Community Seats"
                    value={liveStatsState === "ready" ? liveStats.totalSeats : "···"}
                    subtext="Open spots across every active Nestora pool"
                  />

                  <StatTileRow>
                    <StatTile
                      icon={Layers}
                      label="Pools"
                      value={liveStatsState === "ready" ? liveStats.NestoraCount : "···"}
                    />
                    <StatTile
                      icon={Target}
                      label="Goal Funds"
                      value={liveStatsState === "ready" ? liveStats.goalFundCount : "···"}
                    />
                    <StatTile
                      icon={Users}
                      label="Avg. Group"
                      value={liveStatsState === "ready" ? liveStats.avgGroupSize : "···"}
                    />
                  </StatTileRow>

                  <div className="rounded-xl border bg-card p-4">
                    <p className="text-sm font-semibold mb-3">Live Pools</p>
                    {liveStatsState === "loading" && (
                      <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
                        ))}
                      </div>
                    )}
                    {liveStatsState === "ready" && liveStats.previewPools.length > 0 && (
                      <ul className="space-y-3">
                        {liveStats.previewPools.map((pool) => (
                          <li key={pool.name} className="flex items-center justify-between text-sm gap-3">
                            <span className="flex items-center gap-2 font-medium min-w-0">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                              <span className="truncate">{pool.name}</span>
                            </span>
                            <span className="font-numeric text-muted-foreground whitespace-nowrap">
                              {parseFloat(pool.contributionAmount).toFixed(2)} {getTokenSymbol(pool.tokenAddress)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {liveStatsState === "ready" && liveStats.previewPools.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No pools yet — be the first to create one.
                      </p>
                    )}
                  </div>

                  <GetStartedButton
                    isMiniApp={isMiniApp}
                    account={account}
                    isConnecting={isConnecting}
                    onMainCta={handleMainCta}
                    isConnectDialogOpen={isConnectDialogOpen}
                    setIsConnectDialogOpen={setIsConnectDialogOpen}
                    onConnect={handleConnect}
                    ResponsiveDialogContent={ResponsiveDialogContent}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FEATURES SECTION ==================== */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-muted">
        <div className="container space-y-12 px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <div className="inline-block rounded-lg bg-primary/10 px-3 py-1 text-sm text-primary">
                Platform Benefits
              </div>
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                Empowering Communities Through Decentralized Finance
              </h2>
              <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Nestora combines traditional community savings practices with blockchain technology,
                providing transparency, security, and accessibility for all participants.
              </p>
            </div>
          </div>

          <div className="mx-auto grid items-start gap-8 sm:max-w-4xl sm:grid-cols-2 md:gap-12 lg:max-w-5xl lg:grid-cols-3">
            {[
              { title: "Transparent & Secure", desc: "All transactions are verifiable on the blockchain, ensuring complete transparency and security for your funds." },
              { title: "Community Driven", desc: "Build trust within your community through regular contributions and transparent fund distributions." },
              { title: "Flexible Options", desc: "Choose between rotating savings pools or goal-based funding campaigns to meet your specific needs." },
              { title: "Smart Contract Powered", desc: "Automated distributions and contributions through secure smart contracts, eliminating intermediaries." },
              { title: "Multiple Payment Options", desc: "Use ETH or USDT for contributions, offering flexibility for all participants." },
              { title: "Low Fees", desc: "Minimal platform fees with transparent host commissions, keeping more value in your community." },
            ].map((feature) => (
              <div key={feature.title} className="grid gap-1">
                <h3 className="text-lg font-bold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== CTA SECTION ==================== */}
      <section className="w-full py-12 md:py-24 lg:py-32 border-t">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:grid-cols-2">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                  Ready to start your savings journey?
                </h2>
                <p className="max-w-[600px] text-muted-foreground md:text-xl">
                  Join Nestora today and experience the power of community-driven savings and funding.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 min-[400px]:gap-4">
                <Button
                  variant="default"
                  className="w-full sm:w-auto"
                  disabled={isConnecting}
                  onClick={() => handleCreateNavigation("/create/contribution")}
                >
                  Get Started
                </Button>

                <Link href="/pools">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={isConnecting}
                  >
                    Explore Pools
                  </Button>
                </Link>
              </div>
            </div>

            <div className="flex flex-col justify-center space-y-4 rounded-xl border bg-card p-6">
              <div className="space-y-2">
                <h3 className="text-xl font-bold">Subscribe to updates</h3>
                <p className="text-sm text-muted-foreground">
                  Stay informed about new features and community events.
                </p>
              </div>

              <form className="flex flex-col sm:flex-row gap-2" onSubmit={handleSubscription}>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <Button
                  variant="default"
                  type="submit"
                  className="w-full sm:w-auto"
                >
                  Subscribe
                </Button>
              </form>

              {subscriptionStatus && (
                <p
                  role="status"
                  className={`text-sm ${subscriptionStatus === "success" ? "text-primary" : "text-destructive"}`}
                >
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