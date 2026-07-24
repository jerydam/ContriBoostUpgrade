"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BillFormShell } from "@/components/bills/bill-form-shell";

const PROVIDERS = ["Ikeja Electric", "Eko Electric", "Abuja Electric", "Port Harcourt Electric"];

export default function ElectricityPage() {
  const [provider, setProvider] = useState("");
  const [meterType, setMeterType] = useState("prepaid");
  const [meterNumber, setMeterNumber] = useState("");
  const [amount, setAmount] = useState("");

  const buildSummary = () => {
    if (!provider || !meterNumber || !amount) return null;
    return `${provider} (${meterType === "prepaid" ? "Prepaid" : "Postpaid"}) — Meter ${meterNumber}`;
  };

  return (
    <BillFormShell
      title="Electricity"
      description="Buy prepaid tokens or settle a postpaid electricity bill"
      icon={Zap}
      category="electricity"
      buildSummary={buildSummary}
      amount={amount}
    >
      <div className="space-y-2">
        <Label htmlFor="provider">Provider</Label>
        <Select value={provider} onValueChange={setProvider}>
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
        <Label>Meter Type</Label>
        <RadioGroup value={meterType} onValueChange={setMeterType} className="grid-flow-col auto-cols-fr">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="prepaid" id="prepaid" />
            <Label htmlFor="prepaid" className="font-normal">
              Prepaid
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="postpaid" id="postpaid" />
            <Label htmlFor="postpaid" className="font-normal">
              Postpaid
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="meterNumber">Meter Number</Label>
        <Input
          id="meterNumber"
          placeholder="Enter meter number"
          value={meterNumber}
          onChange={(e) => setMeterNumber(e.target.value)}
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
    </BillFormShell>
  );
}
