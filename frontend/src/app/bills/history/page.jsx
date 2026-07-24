"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, Zap, Tv, Globe, Receipt } from "lucide-react";
import { getBillPayments } from "@/lib/bill-payments";
import { Button } from "@/components/ui/button";

const CATEGORY_ICONS = { airtime: Smartphone, electricity: Zap, tv: Tv, other: Globe };

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function BillHistoryPage() {
  const [payments, setPayments] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPayments(getBillPayments());
    setLoaded(true);
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Payment History</h1>
        <p className="text-muted-foreground text-sm md:text-base">Your simulated bill payments</p>
      </div>

      {!loaded ? null : payments.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-base sm:text-lg mb-2">No payments yet</p>
          <p className="text-muted-foreground mb-4 text-sm">Pay a bill and it'll show up here</p>
          <Button variant="outline" asChild>
            <Link href="/bills">Pay a Bill</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {payments.map((payment) => {
            const Icon = CATEGORY_ICONS[payment.category] ?? Receipt;
            return (
              <li
                key={payment.id}
                className="flex items-center gap-4 rounded-xl border bg-card p-4"
              >
                <div className="bg-primary/10 p-2.5 rounded-full shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{payment.summary}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(payment.timestamp)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-medium font-numeric">
                    {payment.amount} {payment.tokenSymbol}
                  </p>
                  <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                    Simulated
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
