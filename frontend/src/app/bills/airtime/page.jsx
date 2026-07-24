"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillFormShell } from "@/components/bills/bill-form-shell";

const NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"];
const DATA_BUNDLES = [
  { label: "1GB - 30 days", value: "1gb-30", amount: "1.50" },
  { label: "2GB - 30 days", value: "2gb-30", amount: "2.80" },
  { label: "5GB - 30 days", value: "5gb-30", amount: "6.50" },
  { label: "10GB - 30 days", value: "10gb-30", amount: "12.00" },
];

export default function AirtimePage() {
  const [tab, setTab] = useState("airtime");
  const [network, setNetwork] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [bundle, setBundle] = useState("");

  const selectedBundle = DATA_BUNDLES.find((b) => b.value === bundle);
  const currentAmount = tab === "airtime" ? amount : selectedBundle?.amount ?? "";

  const buildSummary = () => {
    if (!network || !phone) return null;
    if (tab === "airtime") {
      if (!amount) return null;
      return `${network} Airtime to ${phone}`;
    }
    if (!selectedBundle) return null;
    return `${network} Data (${selectedBundle.label}) to ${phone}`;
  };

  return (
    <BillFormShell
      title="Airtime & Data"
      description="Top up airtime or buy a data bundle for any network"
      icon={Smartphone}
      category="airtime"
      buildSummary={buildSummary}
      amount={currentAmount}
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="airtime">Airtime</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        <Label htmlFor="network">Network</Label>
        <Select value={network} onValueChange={setNetwork}>
          <SelectTrigger id="network" className="w-full">
            <SelectValue placeholder="Select network" />
          </SelectTrigger>
          <SelectContent>
            {NETWORKS.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="080X XXX XXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      {tab === "airtime" ? (
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
      ) : (
        <div className="space-y-2">
          <Label htmlFor="bundle">Data Bundle</Label>
          <Select value={bundle} onValueChange={setBundle}>
            <SelectTrigger id="bundle" className="w-full">
              <SelectValue placeholder="Select bundle" />
            </SelectTrigger>
            <SelectContent>
              {DATA_BUNDLES.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label} — {b.amount} cUSD
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </BillFormShell>
  );
}
