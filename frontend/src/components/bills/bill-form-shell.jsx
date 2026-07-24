"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "react-toastify";
import { addBillPayment } from "@/lib/bill-payments";

export function BillFormShell({
  title,
  description,
  icon: Icon,
  category,
  buildSummary,
  amount,
  tokenSymbol = "cUSD",
  children,
}) {
  const router = useRouter();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingSummary, setPendingSummary] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const summary = buildSummary();
    if (!summary) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setPendingSummary(summary);
    setIsConfirmOpen(true);
  };

  const handleConfirm = () => {
    setIsSubmitting(true);
    addBillPayment({ category, summary: pendingSummary, amount, tokenSymbol });
    window.setTimeout(() => {
      setIsSubmitting(false);
      setIsConfirmOpen(false);
      toast.success("Payment simulated successfully!");
      router.push("/bills/history");
    }, 500);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-xl">
      <Link
        href="/bills"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Bills
      </Link>

      <div className="flex items-center gap-3 mb-2">
        {Icon && (
          <div className="bg-primary/10 p-2 rounded-full">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        )}
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      <p className="text-muted-foreground mb-6">{description}</p>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardContent className="pt-6 space-y-4">{children}</CardContent>
          <CardFooter>
            <Button type="submit" variant="default" className="w-full">
              Pay with {tokenSymbol}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/50 p-4 text-sm space-y-1">
              <p className="font-medium">{pendingSummary}</p>
              {amount ? (
                <p className="text-muted-foreground font-numeric">
                  {amount} {tokenSymbol}
                </p>
              ) : null}
            </div>
            <Alert className="bg-accent border-accent">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Simulated payment — provider integration pending. No funds will move.
              </AlertDescription>
            </Alert>
          </div>
          <Button onClick={handleConfirm} disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Processing..." : "Confirm Payment"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
