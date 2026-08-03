"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWeb3 } from "./providers/web3-provider";
import { Loader2, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { CHAIN_ID, CHAIN_CONFIG } from "@/lib/chain-config";

export default function Header() {
  const { connect, disconnect, account, chainId, isConnecting } = useWeb3();
  const pathname = usePathname();

  const navLinks = [
    { name: "Nestora Pools", href: "/pools" },
    { name: "Bills", href: "/bills" },
    { name: "My Account", href: "/account" },
  ];

  const isActive = (path) => path === pathname;

  const formatAccount = (account) => {
    if (!account) return "";
    return `${account.slice(0, 6)}...${account.slice(-4)}`;
  };

  const getChainName = (chainId) => {
    if (chainId === CHAIN_ID) {
      return CHAIN_CONFIG.chainName;
    }
    // Since we force switch in provider, this shouldn't happen often,
    // but good to handle the 'loading' or 'wrong network' state visually
    return chainId ? `Chain ID: ${chainId}` : "";
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold">
            <Image
              src="/contrib.png"
              alt="Nestora Logo"
              width={150}
              height={150}
              className="inline-block mr-2"
              priority
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
              <Button variant="outline" size="sm" onClick={disconnect} aria-label="Disconnect wallet">
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Disconnect</span>
              </Button>
            </div>
          ) : (
            <Button
              variant="default"
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
                  <span className="hidden sm:inline">Login</span>
                  <span className="sm:hidden">Login</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
