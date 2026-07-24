"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Layers, Receipt, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "Home", href: "/", icon: Home },
  { name: "Pools", href: "/pools", icon: Layers },
  { name: "Bills", href: "/bills", icon: Receipt },
  { name: "Account", href: "/account", icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.name}>
              <Link
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors min-h-[56px]",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                {tab.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
