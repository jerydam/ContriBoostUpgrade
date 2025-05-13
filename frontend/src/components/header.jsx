"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Wallet, LogOut, Mail, Phone, Key, User, Copy } from "lucide-react";
import { useWeb3 } from "@/components/providers/web3-provider";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Header() {
  const { connect, connectInAppWallet, disconnect, account, chainId, walletType, switchNetwork, isConnecting, balance } = useWeb3();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);
  const [authState, setAuthState] = useState(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  const navLinks = [
    { name: "Contriboost Pools", href: "/pools" },
    { name: "My Account", href: "/account" },
  ];

  const SUPPORTED_CHAINS = {
    4202: {
      chainId: "0x106A",
      chainName: "Lisk Sepolia",
      rpcUrls: ["https://rpc.sepolia-api.lisk.com"],
      nativeCurrency: {
        name: "Lisk",
        symbol: "LSK",
        decimals: 18,
      },
      blockExplorerUrls: ["https://sepolia-blockscout.lisk.com"],
    },
    // 44787: {
    //   chainId: "0xAEF3",
    //   chainName: "Celo Alfajores",
    //   rpcUrls: ["https://alfajores-forno.celo-testnet.org"],
    //   nativeCurrency: {
    //     name: "Celo",
    //     symbol: "CELO",
    //     decimals: 18,
    //   },
    //   blockExplorerUrls: ["https://alfajores-blockscout.celo-testnet.org"],
    // },
  };

  const isActive = (path) => path === pathname;

  const formatAccount = (account) => {
    if (!account) return "";
    return `${account.slice(0, 6)}...${account.slice(-4)}`;
  };

  const getChainName = (chainId) => {
    switch (chainId) {
      case 4202:
        return "Lisk Sepolia";
      // case 44787:
      //   return "Celo Alfajores";
      default:
        return `Unknown Chain (${chainId || "Not Connected"})`;
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const validatePhoneNumber = (value) => {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!value) return "";
    return e164Regex.test(value) ? "" : "Please enter a valid phone number (e.g., +1234567890)";
  };

  const handleConnect = async (connectorId, options = {}) => {
    try {
      if (connectorId === "metamask") {
        await connect();
        setIsConnectDialogOpen(false);
      } else {
        if (chainId === 44787) {
          toast.error("Smart Wallet is not supported on current chain. Please switch to Lisk Sepolia or use MetaMask.");
          return;
        }
        if (connectorId === "phone") {
          const error = validatePhoneNumber(options.phoneNumber);
          if (error) {
            toast.error(error);
            return;
          }
        }
        const result = await connectInAppWallet(connectorId, options);
        if (result && result.preAuth) {
          setAuthState(`${result.type}_verify`);
          toast.info(`Verification code sent to ${result.type === "email" ? options.email : options.phoneNumber}`);
        } else {
          setIsConnectDialogOpen(false);
          setAuthState(null);
          setEmail("");
          setPhone("");
          setVerificationCode("");
          toast.success("Connected successfully!");
        }
      }
    } catch (error) {
      toast.error(`Failed to connect: ${error.message}`);
    }
  };

  const handleVerification = async () => {
    try {
      if (chainId === 44787) {
        toast.error("Smart Wallet is not supported on current chain. Please switch to Lisk Sepolia or use MetaMask.");
        return;
      }
      if (authState === "email_verify") {
        await connectInAppWallet("email", {
          email,
          verificationCode,
        });
      } else if (authState === "phone_verify") {
        await connectInAppWallet("phone", {
          phoneNumber: phone,
          verificationCode,
        });
      }
      setIsConnectDialogOpen(false);
      setAuthState(null);
      setEmail("");
      setPhone("");
      setVerificationCode("");
      toast.success("Verified and connected successfully!");
    } catch (error) {
      toast.error(`Failed to verify: ${error.message}`);
    }
  };

  const handleCopyAddress = () => {
    if (account) {
      navigator.clipboard.writeText(account).then(() => {
        toast.success("Address copied to clipboard!");
      }).catch(() => {
        toast.error("Failed to copy address.");
      });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/" className="text-lg font-bold sm:text-xl lg:text-2xl">
            <Image
              src={"/contriboostb.png"}
              alt="Contriboost Logo"
              width={500}
              height={500}
              className="h-auto w-auto sm:h-10 lg:h-12 bg-amber-50"
            />
          </Link>
          <nav className="hidden md:flex">
            <ul className="flex items-center gap-4 sm:gap-6">
              {navLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className={`text-sm font-medium transition-colors hover:text-primary ${
                      isActive(link.href) ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <ThemeToggle />
          {account ? (
            <div className="flex items-center w-full gap-2 sm:gap-4">
              <Dialog open={isWalletDialogOpen} onOpenChange={setIsWalletDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="hidden text-xs sm:text-sm md:inline-flex max-w-full truncate hover:bg-accent"
                  >
                    {walletType === "eoa" ? "MetaMask" : "Smart Wallet"}: {formatAccount(account)} ({getChainName(chainId)})
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#101b31] max-w-[90vw] sm:max-w-md rounded-lg">
                  <DialogHeader>
                    <DialogTitle className="text-base sm:text-lg">Wallet Details</DialogTitle>
                    <DialogDescription className="text-xs sm:text-sm">
                      View your wallet information and balance.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 sm:gap-4 py-4">
                    <div>
                      <h3 className="text-sm font-medium">Address</h3>
                      <div className="flex items-center gap-2">
                        <p className="text-xs sm:text-sm text-muted-foreground break-all">{account}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyAddress}
                          className="p-1"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">Balance</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {balance || "Fetching balance..."}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium">Network</h3>
                      <Select
                        onValueChange={(value) => switchNetwork(Number(value))}
                        defaultValue={chainId?.toString()}
                      >
                        <SelectTrigger className="w-full text-xs sm:text-sm h-9 sm:h-10">
                          <SelectValue placeholder="Select Network" />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-h-[50vh] overflow-y-auto bg-[#101b31] text-white border border-gray-700 rounded-md">
                          {Object.entries(SUPPORTED_CHAINS).map(([chainId, chain]) => (
                            <SelectItem
                              key={chainId}
                              value={chainId}
                              className="text-xs sm:text-sm px-3 py-2 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer"
                              disabled={walletType === "smart" || walletType === "eoa" && chainId === "44787"}
                            >
                              {chain.chainName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnect}
                disabled={isConnecting}
                className="text-xs sm:text-sm"
              >
                <LogOut className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Disconnect</span>
                <span className="sm:hidden">Log Out</span>
              </Button>
            </div>
          ) : (
            <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isConnecting}
                  className="text-xs sm:text-sm"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin sm:mr-2" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Wallet className="h-4 w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Connect Wallet</span>
                      <span className="sm:hidden">Connect</span>
                    </>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#101b31] max-w-[90vw] sm:max-w-md rounded-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-base sm:text-lg">
                    {authState === "email_verify" || authState === "phone_verify"
                      ? "Verify Your Identity"
                      : "Connect Your Wallet"}
                  </DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm">
                    {authState === "email_verify"
                      ? "Enter the verification code sent to your email."
                      : authState === "phone_verify"
                      ? "Enter the verification code sent to your phone."
                      : "Choose a method to connect to Contriboost."}
                  </DialogDescription>
                </DialogHeader>
                {authState === "email_verify" || authState === "phone_verify" ? (
                  <div className="grid gap-3 sm:gap-4 py-4">
                    <Input
                      type={authState === "email_verify" ? "email" : "tel"}
                      placeholder={authState === "email_verify" ? "Enter your email" : "Enter your phone number"}
                      value={authState === "email_verify" ? email : phone}
                      onChange={(e) =>
                        authState === "email_verify" ? setEmail(e.target.value) : setPhone(e.target.value)
                      }
                      disabled
                      className="text-xs sm:text-sm"
                    />
                    <Input
                      type="text"
                      placeholder="Enter verification code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="text-xs sm:text-sm"
                    />
                    <Button
                      onClick={handleVerification}
                      disabled={isConnecting || !verificationCode}
                      className="text-xs sm:text-sm"
                    >
                      {isConnecting ? "Verifying..." : "Verify"}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:gap-4 py-4">
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-3 sm:py-4 text-xs sm:text-sm"
                      onClick={() => handleConnect("metamask")}
                      disabled={isConnecting}
                    >
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="bg-primary/10 p-1 sm:p-2 rounded-full">
                          <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-medium">MetaMask</h3>
                          <p className="text-xs text-muted-foreground">Connect using MetaMask wallet</p>
                        </div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-3 sm:py-4 text-xs sm:text-sm"
                      onClick={() => handleConnect("google")}
                      disabled={isConnecting || chainId === 44787}
                    >
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="bg-primary/10 p-1 sm:p-2 rounded-full">
                          <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24">
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
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.69 1 4.01 3.48 2.18 7.07l3 guida.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                          </svg>
                        </div>
                        <div className="text-left">
                          <h3 className="font-medium">Google</h3>
                          <p className="text-xs text-muted-foreground">Sign in with Google (Gasless)</p>
                        </div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-3 sm:py-4 text-xs sm:text-sm"
                      onClick={() => handleConnect("email", { email })}
                      disabled={isConnecting || !email || chainId === 44787}
                    >
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="bg-primary/10 p-1 sm:p-2 rounded-full">
                          <Mail className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-medium">Email</h3>
                          <p className="text-xs text-muted-foreground">Sign in with email (Gasless)</p>
                        </div>
                      </div>
                    </Button>
                    <Input
                      type="email"
                      placeholder="Enter email for email login"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-2 text-xs sm:text-sm"
                    />
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-3 sm:py-4 text-xs sm:text-sm"
                      onClick={() => handleConnect("phone", { phoneNumber: phone })}
                      disabled={isConnecting || !phone || !!phoneError || chainId === 44787}
                    >
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="bg-primary/10 p-1 sm:p-2 rounded-full">
                          <Phone className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-medium">Phone</h3>
                          <p className="text-xs text-muted-foreground">Sign in with phone (Gasless)</p>
                        </div>
                      </div>
                    </Button>
                    <Input
                      type="tel"
                      placeholder="Enter phone number (e.g., +1234567890)"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setPhoneError(validatePhoneNumber(e.target.value));
                      }}
                      className="mt-2 text-xs sm:text-sm"
                    />
                    {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-3 sm:py-4 text-xs sm:text-sm"
                      onClick={() => handleConnect("passkey")}
                      disabled={isConnecting || chainId === 44787}
                    >
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="bg-primary/ Indy/10/10 sm:gap-4">
                          <div className="bg-primary/10 p-1 sm:p-2 rounded-full">
                            <Key className="h-5 w-5 sm:h-6 sm:w-6" />
                          </div>
                          <div className="text-left">
                            <h3 className="font-medium">Passkey</h3>
                            <p className="text-xs text-muted-foreground">Sign in with passkey (Gasless)</p>
                          </div>
                        </div>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start h-auto py-3 sm:py-4 text-xs sm:text-sm"
                        onClick={() => handleConnect("guest")}
                        disabled={isConnecting || chainId === 44787}
                      >
                        <div className="flex items-center gap-2 sm:gap-4">
                          <div className="bg-primary/10 p-1 sm:p-2 rounded-full">
                            <User className="h-5 w-5 sm:h-6 sm:w-6" />
                          </div>
                          <div className="text-left">
                            <h3 className="font-medium">Guest</h3>
                            <p className="text-xs text-muted-foreground">Connect as a guest (Gasless)</p>
                          </div>
                        </div>
                      </Button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            )}
            <button
              onClick={toggleMobileMenu}
              className="ml-2 rounded-md p-2 text-muted-foreground hover:bg-accent md:hidden transition-colors"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-200"
              >
                {isMobileMenuOpen ? (
                  <path d="M18 6 6 18M6 6l12 12" />
                ) : (
                  <path d="M3 12h18M3 6h18M3 18h18" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 bg-background/95 backdrop-blur-sm z-40 transition-opacity duration-300">
            <div className="container mx-auto px-4 py-4 h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <Link href="/" className="text-lg font-bold sm:text-xl">
                  <Image
                    src="/contriboostb.png"
                    alt="Contriboost Logo"
                    width={100}
                    height={100}
                    className="h-auto w-auto sm:h-10 bg-amber-50"
                  />
                </Link>
                <button
                  onClick={toggleMobileMenu}
                  className="rounded-md p-2 text-muted-foreground hover:bg-accent transition-colors"
                  aria-label="Close menu"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <nav className="flex-1">
                <ul className="flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <li key={link.name}>
                      <Link
                        href={link.href}
                        className={`block p-2 text-base font-medium transition-colors hover:text-primary ${
                          isActive(link.href) ? "text-primary" : "text-muted-foreground"
                        }`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {link.name}
                      </Link>
                    </li>
                  ))}
                  {account && (
                    <li className="block p-2 text-sm text-muted-foreground max-w-[90%] truncate">
                      <Button
                        variant="ghost"
                        className="text-left w-full truncate"
                        onClick={() => setIsWalletDialogOpen(true)}
                      >
                        {walletType === "eoa" ? "MetaMask" : "Smart Wallet"}: {formatAccount(account)} ({getChainName(chainId)})
                      </Button>
                    </li>
                  )}
                </ul>
              </nav>
              {account && (
                <div className="mt-auto pb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={disconnect}
                    disabled={isConnecting}
                    className="w-full text-sm"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>
    );
}