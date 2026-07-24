"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BillFormShell } from "@/components/bills/bill-form-shell";

export default function OtherBillPage() {
  const [billerName, setBillerName] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const buildSummary = () => {
    if (!billerName || !reference || !amount) return null;
    return `${billerName} — Ref ${reference}`;
  };

  return (
    <BillFormShell
      title="Internet, Water & Other Bills"
      description="Pay any biller not listed above"
      icon={Globe}
      category="other"
      buildSummary={buildSummary}
      amount={amount}
    >
      <div className="space-y-2">
        <Label htmlFor="billerName">Biller Name</Label>
        <Input
          id="billerName"
          placeholder="e.g. Lagos Water Corporation"
          value={billerName}
          onChange={(e) => setBillerName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reference">Customer ID / Reference</Label>
        <Input
          id="reference"
          placeholder="Enter your account or reference number"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          placeholder="Anything the biller should know"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </BillFormShell>
  );
}
