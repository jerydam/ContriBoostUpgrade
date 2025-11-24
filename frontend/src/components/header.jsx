"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWeb3 } from "./providers/web3-provider";
import { Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Header() {
  const { connect, disconnect, account, chainId, isConnecting } = useWeb3();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "Contriboost Pools", href: "/pools" },
    { name: "My Account", href: "/account" },
  ];

  const isActive = (path) => path === pathname;

  const formatAccount = (account) => {
    if (!account) return "";
    return `${account.slice(0, 6)}...${account.slice(-4)}`;
  };

  const getChainName = (chainId) => {
    if (chainId === 42220) {
      return "Celo Mainnet";
    }
    // Since we force switch in provider, this shouldn't happen often, 
    // but good to handle the 'loading' or 'wrong network' state visually
    return chainId ? `Chain ID: ${chainId}` : "";
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold">
            <Image
              src="/contrib.png"
              alt="ContriBoost Logo"
              width={150}
              height={150}
              className="inline-block mr-2"
            />
          </Link>
          <nav className="hidden md:flex">
            <ul className="flex items-center gap-6">
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

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {account ? (
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end">
                <span className="text-xs font-medium md:text-sm">
                  {formatAccount(account)}
                </span>
                <span className="text-[10px] text-muted-foreground md:text-xs">
                  {getChainName(chainId)}
                </span>
              </div>
              <Button 
                variant="outline"
                size="sm" 
                onClick={disconnect}
                className="hidden sm:flex"
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline"
              onClick={connect} 
              disabled={isConnecting}
              className="text-xs sm:text-sm"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Connecting...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Connect Wallet</span>
                  <span className="sm:hidden">Connect</span>
                </>
              )}
            </Button>
          )}
          <button
            onClick={toggleMobileMenu}
            className="ml-2 rounded-md p-2 text-muted-foreground hover:bg-accent md:hidden"
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
              {isMobileMenuOpen ? (
                <path d="M18 6 6 18M6 6l12 12" />
              ) : (
                <path d="M3 12h18M3 6h18M3 18h18" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu - Floating/Overlay Style */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 md:hidden z-30"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Menu Panel */}
          <div className="absolute top-16 left-0 right-0 bg-card/95 dark:bg-card/90 border-b shadow-lg md:hidden z-40 animate-in slide-in-from-top-2 backdrop-blur-lg">
            <div className="container py-4 px-4">
              <nav>
                <ul className="flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <li key={link.name}>
                      <Link
                        href={link.href}
                        className={`block p-3 text-sm font-medium transition-colors rounded-md hover:bg-accent ${
                          isActive(link.href) 
                            ? "text-primary bg-accent" 
                            : "text-muted-foreground"
                        }`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {link.name}
                      </Link>
                    </li>
                  ))}
                  
                  {/* Wallet Info on Mobile */}
                  {account && (
                    <>
                      <li className="border-t pt-4">
                        <div className="p-3 bg-muted/50 rounded-md">
                          <p className="text-xs text-muted-foreground mb-1">Connected Wallet</p>
                          <p className="text-sm font-medium">{formatAccount(account)}</p>
                          <p className="text-xs text-muted-foreground mt-1">{getChainName(chainId)}</p>
                        </div>
                      </li>
                      <li>
                        <Button 
                          variant="outline"
                          onClick={() => {
                            disconnect();
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full"
                        >
                          Disconnect Wallet
                        </Button>
                      </li>
                    </>
                  )}
                </ul>
              </nav>
            </div>
          </div>
        </>
      )}
    </header>
  );
}