"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowRight, ChevronRight, Coins, Wallet } from "lucide-react";
import { useWeb3 } from "@/components/providers/web3-provider";

export default function LandingPage() {
  const { account, walletType, connect, connectInAppWallet, isConnecting } = useWeb3();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");
  const [isEmailVerification, setIsEmailVerification] = useState(false);
  const router = useRouter();

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
      console.error("Connection failed:", error);
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
      console.error("Verification failed:", error);
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
      const data = await response.json();
      setSubscriptionStatus("success");
      setSubscriptionMessage("Thank you for subscribing!");
      setEmail("");
    } catch (error) {
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
            <div className="flex flex-col justify-center space-y-4">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-[3.4rem] font-bold tracking-tighter leading-tight">
                Save Together, Achieve Together
              </h1>
              <p className="max-w-[600px] text-muted-foreground text-sm sm:text-base md:text-lg lg:text-xl">
                Create or join rotating savings pools with Contriboost, or fund your goals with GoalFund. A
                decentralized ecosystem for community savings.
              </p>
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
                  <DialogContent className="w-[90vw] max-w-[95vw] sm:max-w-md max-h-[80vh] overflow-y-auto bg-[#101b31] rounded-lg p-4 sm:p-6">
                    <DialogHeader>
                      <DialogTitle className="text-base sm:text-lg">Choose what to create</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <Button
                        variant="outline"
                        className="w-full justify-start h-auto py-4 text-sm sm:text-base touch:min-h-[48px]"
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
                        className="w-full justify-start h-auto py-4 text-sm sm:text-base touch:min-h-[48px]"
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
                    size="lg"
                    className="w-full sm:w-auto h-10 sm:h-11 touch:min-h-[44px] text-sm sm:text-base hover:bg-[#6264c7]"
                    disabled={isConnecting}
                  >
                    Explore Contribution Pools <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              {account && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Connected with {walletType === "eoa" ? "MetaMask" : "Smart Wallet"}: {formatAddress(account)}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center">
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
                                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1.04.69-2.37 1.10-3.71 1.10-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C4.01 20.52 7.69 23 12 23z"
                                    />
                                    <path
                                      fill="#FBBC05"
                                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    />
                                    <path
                                      fill="#EA4335"
                                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.69 1 4.01 3.48 2.18 7.07l3.66 2.84c.87-2.60 3.30-4.53 6.16-4.53z"
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