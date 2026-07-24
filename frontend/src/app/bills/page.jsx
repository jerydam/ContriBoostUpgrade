"use client";

import Link from "next/link";
import { Smartphone, Zap, Tv, Globe, ChevronRight, History } from "lucide-react";

const categories = [
  {
    title: "Airtime & Data",
    description: "Top up airtime or buy a data bundle",
    href: "/bills/airtime",
    icon: Smartphone,
  },
  {
    title: "Electricity",
    description: "Buy prepaid or pay postpaid electricity",
    href: "/bills/electricity",
    icon: Zap,
  },
  {
    title: "Cable TV",
    description: "Renew your DStv, GOtv, or StarTimes plan",
    href: "/bills/tv",
    icon: Tv,
  },
  {
    title: "Internet, Water & Other",
    description: "Pay any other biller or utility",
    href: "/bills/other",
    icon: Globe,
  },
];

export default function BillsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Pay Bills</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Pay for everyday bills directly from your wallet
          </p>
        </div>
        <Link
          href="/bills/history"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0 pt-1"
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">History</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <Link
              key={category.href}
              href={category.href}
              className="flex items-start gap-4 rounded-xl border bg-card p-5 transition-colors hover:bg-accent"
            >
              <div className="bg-primary/10 p-2.5 rounded-full shrink-0">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium">{category.title}</h3>
                <p className="text-sm text-muted-foreground">{category.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground self-center shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
