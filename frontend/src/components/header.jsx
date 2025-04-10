"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation"; // Fixed import
import { Button } from "@/components/ui/button";
import { useWeb3 } from "./providers/web3-provider";
import { Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Header() {
  const { connect, disconnect, account, chainId, isConnecting } = useWeb3();
  const pathname = usePathname(); // Fixed typo: leaguesusePathname → usePathname
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
    switch (chainId) {
      case 4202:
        return "Lisk Sepolia";
      case 44787:
        return "Celo Alfajores";
      default:
        return `Unknown Chain (${chainId})`;
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold">
            Contriboost
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
              <span className="hidden text-sm md:inline-block">
                {formatAccount(account)} ({getChainName(chainId)})
              </span>
              <Button variant="outline" size="sm" onClick={disconnect}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={connect} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect Wallet"
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

      {isMobileMenuOpen && (
        <div className="container border-t py-4 md:hidden">
          <nav>
            <ul className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className={`block p-2 text-sm font-medium transition-colors hover:text-primary ${
                      isActive(link.href) ? "text-primary" : "text-muted-foreground"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
              {account && (
                <li className="block p-2 text-sm text-muted-foreground">
                  {formatAccount(account)} ({getChainName(chainId)})
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}