"use client";

import { useState } from "react";
import { Tv } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BillFormShell } from "@/components/bills/bill-form-shell";

const PROVIDERS = ["DStv", "GOtv", "StarTimes"];
const PACKAGES = {
  DStv: [
    { label: "Compact", amount: "20.00" },
    { label: "Premium", amount: "45.00" },
  ],
  GOtv: [
    { label: "Jolli", amount: "5.00" },
    { label: "Max", amount: "8.00" },
  ],
  StarTimes: [
    { label: "Basic", amount: "4.00" },
    { label: "Classic", amount: "6.50" },
  ],
};

export default function TvPage() {
  const [provider, setProvider] = useState("");
  const [smartcard, setSmartcard] = useState("");
  const [pkg, setPkg] = useState("");

  const packages = provider ? PACKAGES[provider] : [];
  const amount = packages.find((p) => p.label === pkg)?.amount ?? "";

  const buildSummary = () => {
    if (!provider || !smartcard || !pkg) return null;
    return `${provider} ${pkg} — Smartcard ${smartcard}`;
  };

  return (
    <BillFormShell
      title="Cable TV"
      description="Renew your DStv, GOtv, or StarTimes subscription"
      icon={Tv}
      category="tv"
      buildSummary={buildSummary}
      amount={amount}
    >
      <div className="space-y-2">
        <Label htmlFor="provider">Provider</Label>
        <Select
          value={provider}
          onValueChange={(v) => {
            setProvider(v);
            setPkg("");
          }}
        >
          <SelectTrigger id="provider" className="w-full">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="smartcard">Smartcard / IUC Number</Label>
        <Input
          id="smartcard"
          placeholder="Enter smartcard number"
          value={smartcard}
          onChange={(e) => setSmartcard(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="package">Package</Label>
        <Select value={pkg} onValueChange={setPkg} disabled={!provider}>
          <SelectTrigger id="package" className="w-full">
            <SelectValue placeholder={provider ? "Select package" : "Select a provider first"} />
          </SelectTrigger>
          <SelectContent>
            {packages.map((p) => (
              <SelectItem key={p.label} value={p.label}>
                {p.label} — {p.amount} cUSD
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </BillFormShell>
  );
}
