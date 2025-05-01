"use client";

import { useState, useEffect } from "react";
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
import { ChevronRight, Coins, Wallet } from "lucide-react";
import { useWeb3 } from "@/components/providers/web3-provider";
import { showToast } from "@/utils/toast";

export default function CreateNowButton() {
  const { account, isConnecting, connect, connectInAppWallet, connectionError } = useWeb3(); // Added connectionError
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isEmailVerification, setIsEmailVerification] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (account && pendingNavigation) {
      router.push(pendingNavigation);
      setPendingNavigation(null);
      setIsConnectDialogOpen(false);
    }
  }, [account, pendingNavigation, router]);

  const handleCreateNavigation = (path) => {
    setIsCreateDialogOpen(false);
    if (!account) {
      setIsConnectDialogOpen(true);
      setPendingNavigation(path);
    } else {
      router.push(path);
    }
  };

  const handleConnect = async (type, options = {}) => {
    try {
      if (type === "metamask") {
        await connect();
        showToast("Connected with MetaMask!", "success");
      } else if (type === "google") {
        await connectInAppWallet("google");
        showToast("Connected with Google!", "success");
      } else if (type === "email") {
        const result = await connectInAppWallet("email", { email });
        if (result && result.preAuth) {
          setIsEmailVerification(true);
          showToast(`Verification code sent to ${email}`, "info");
        } else {
          showToast("Connected with Email!", "success");
          setIsConnectDialogOpen(false);
        }
      }
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const handleEmailVerification = async () => {
    try {
      await connectInAppWallet("email", { email, verificationCode });
      setIsEmailVerification(false);
      setIsConnectDialogOpen(false);
      setEmail("");
      setVerificationCode("");
      showToast("Verified and connected successfully!", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  return (
    <>
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="inline-flex items-center px-6 py-3 border border-primary text-primary rounded-md hover:bg-primary hover:text-primary-foreground transition-colors"
            disabled={isConnecting}
            aria-label="Create a pool or fund"
          >
            Create Now
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-[#101b31] max-w-[90vw] sm:max-w-md h-[90vh] sm:h-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle id="create-dialog-title">Choose what to create</DialogTitle>
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
                  <h3 className="font-medium">Create Contribution Pool</h3>
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

      <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
        <DialogContent
          className="bg-[#101b31] max-w-[90vw] sm:max-w-md h-[90vh] sm:h-auto max-h-[90vh] overflow-y-auto"
          aria-labelledby="connect-wallet-dialog-title"
        >
          <DialogHeader>
            <DialogTitle id="connect-wallet-dialog-title">
              {isEmailVerification ? "Verify Email" : "Connect Your Wallet"}
            </DialogTitle>
          </DialogHeader>
          {connectionError && (
            <p className="text-sm text-red-500 mt-2">{connectionError}</p>
          )}
          {isEmailVerification ? (
            <div className="grid gap-4 py-4">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled
              />
              <Input
                type="text"
                placeholder="Enter verification code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
              />
              <Button
                onClick={handleEmailVerification}
                disabled={isConnecting || !verificationCode}
              >
                {isConnecting ? "Verifying..." : "Verify"}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 py-4">
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
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1.04.69-2.37 1.1-3.71 1.1-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C4.01 20.52 7.69 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.69 1 4.01 3.48 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h3 className="font-medium">Google</h3>
                    <p className="text-sm text-muted-foreground">
                      Sign in with Google (Gasless Experience)
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
                className="mt-2"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}