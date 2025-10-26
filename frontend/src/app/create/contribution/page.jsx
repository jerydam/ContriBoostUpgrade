"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import { createContriboost } from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Loader2, Info, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "react-toastify";
// Import Divvi utilities
import { generateDivviTag, submitDivviReferral } from "@/lib/divvi";

const CONTRACT_ADDRESSES = {
  celo: {
    factory: "0x4C9118aBffa2aCCa4a16d08eC1222634eb744748",
    cusd: "0xFE18f2C089f8fdCC843F183C5aBdeA7fa96C78a8",
    celo: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
  },
};

const SUPPORTED_CHAINS = {
  celo: 44787,
};

const formSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  description: z.string().min(10, { message: "Description must be at least 10 characters" }),
  dayRange: z.coerce.number().int().min(1, { message: "Must be at least 1 day" }),
  expectedNumber: z.coerce.number().int().min(2, { message: "Must have at least 2 participants" }),
  contributionAmount: z.string().refine(
    (value) => {
      try {
        return parseEther(value) > 0n;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid amount greater than 0" }
  ),
  tokenType: z.enum(["0", "1"]),
  hostFeePercentage: z.coerce.number().min(0).max(5, { message: "Fee must be between 0% and 5%" }),
  maxMissedDeposits: z.coerce.number().int().min(0, { message: "Must be 0 or more" }),
  startTimestamp: z.string().refine(
    (value) => {
      const date = new Date(value);
      return !isNaN(date.getTime()) && date > new Date();
    },
    { message: "Start date and time must be in the future" }
  ),
});

export default function CreateContriboostPage() {
  const router = useRouter();
  const { signer, account, connect, connectInAppWallet, chainId, switchNetwork, thirdwebClient, celoAlfajores, walletType } = useWeb3();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNetwork, setSelectedNetwork] = useState(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      dayRange: "7",
      expectedNumber: "10",
      contributionAmount: "0.1",
      tokenType: "0",
      hostFeePercentage: "2",
      maxMissedDeposits: "2",
      startTimestamp: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    },
  });

  useEffect(() => {
    if (chainId) {
      if (chainId === SUPPORTED_CHAINS.celo) {
        setSelectedNetwork("celo");
      } else {
        setError("Unsupported network. Please switch to Celo Alfajores.");
        setSelectedNetwork(null);
      }
    } else {
      setSelectedNetwork(null);
    }
  }, [chainId]);

  async function handleNetworkSwitch(network) {
    try {
      if (!account) {
        await connect();
        if (!account) {
          setError("Please connect your wallet to switch networks.");
          try {
            toast.warning("Please connect your wallet to switch networks.");
          } catch (toastError) {
            console.error("Toast error:", toastError);
          }
          return;
        }
      }

      if (walletType === "smart") {
        setError("Smart wallets do not require manual network switching on Celo Alfajores.");
        try {
          toast.info("Smart wallets are already configured for Celo Alfajores.");
        } catch (toastError) {
          console.error("Toast error:", toastError);
        }
        return;
      }

      const targetChainId = SUPPORTED_CHAINS[network];
      await switchNetwork(targetChainId);
      setError(null);
      try {
        toast.info(`Switched to Celo Alfajores network`);
      } catch (toastError) {
        console.error("Toast error:", toastError);
      }
    } catch (err) {
      setError("Failed to switch network. Please switch manually in your wallet.");
      toast.error("Failed to switch network");
    }
  };

  async function onSubmit(values) {
    if (!account) {
      await connect();
      if (!account) {
        setError("Please connect your wallet first");
        toast.warning("Please connect your wallet first");
        return;
      }
    }

    if (!selectedNetwork) {
      setError("Please select a supported network (Lisk or Celo)");
      toast.error("Unsupported network");
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const factoryAddress = CONTRACT_ADDRESSES[selectedNetwork].factory;
      
      // Handle token address based on payment method and network
      let tokenAddress;
      if (values.paymentMethod === "1") {
        // Stablecoin payment
        tokenAddress = CONTRACT_ADDRESSES[selectedNetwork][selectedNetwork === "lisk" ? "usdt" : "cusd"];
      } else {
        // Native token payment
        if (selectedNetwork === "celo") {
          // On Celo, native CELO is an ERC-20 token
          tokenAddress = CONTRACT_ADDRESSES[selectedNetwork].celo;
        } else {
          // On Lisk (and Ethereum-like chains), use zero address for ETH
          tokenAddress = ethers.ZeroAddress;
        }
      }

      const factoryContract = new ethers.Contract(factoryAddress, ContriboostFactoryAbi, signer);
      const config = {
        dayRange: values.dayRange,
        expectedNumber: values.expectedNumber,
        contributionAmount: ethers.parseEther(values.contributionAmount),
        hostFeePercentage: values.hostFeePercentage * 100,
        platformFeePercentage: 50,
        maxMissedDeposits: values.maxMissedDeposits,
        startTimestamp: Math.floor(new Date(values.startTimestamp).getTime() / 1000),
        paymentMethod: Number(values.paymentMethod),
      };

      console.log("Creating Contriboost with config:", config, "Token address:", tokenAddress);

      // 🎯 DIVVI INTEGRATION START
      // Step 1: Generate Divvi referral tag for this user
      const referralTag = generateDivviTag(account);
      console.log("🏷️ Generated Divvi referral tag");

      // Step 2: Populate the transaction to get the data field
      const populatedTx = await factoryContract.createContriboost.populateTransaction(
        config,
        values.name,
        values.description,
        tokenAddress
      );

      // Step 3: Append Divvi referral tag to transaction data
      populatedTx.data = populatedTx.data + referralTag.slice(2); // Remove '0x' from tag before appending
      console.log("📎 Appended Divvi referral tag to transaction");

      // Step 4: Estimate gas and send transaction with Divvi tag
      let tx;
      if (supportsGasEstimation) {
        const estimatedGas = await signer.estimateGas(populatedTx);
        const gasLimit = Math.floor(Number(estimatedGas) * 1.2);
        tx = await signer.sendTransaction({
          ...populatedTx,
          gasLimit,
        });
      } else {
        tx = await signer.sendTransaction(populatedTx);
      }

      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);

      // Step 5: Submit referral to Divvi after transaction confirmation
      await submitDivviReferral(tx.hash, chainId);
      console.log("✅ Divvi referral tracking complete");
      // 🎯 DIVVI INTEGRATION END

      const contriboostCreatedEvent = receipt.logs.find(
        (log) => {
          try {
            const parsedLog = factoryContract.interface.parseLog(log);
            return parsedLog?.name === "ContriboostCreated";
          } catch {
            return false;
          }
        }
      );

      if (contriboostCreatedEvent) {
        const parsedEvent = factoryContract.interface.parseLog(contriboostCreatedEvent);
        const newContriboostAddress = parsedEvent.args.contriboost;
        console.log("New Contriboost created at:", newContriboostAddress);
        toast.success("Contriboost created successfully!");
        router.push(`/pools/details/${newContriboostAddress}?network=${selectedNetwork}`);
      } else {
        toast.success("Contriboost created successfully!");
        router.push("/pools");
      }
    } catch (err) {
      console.error("Error creating Contriboost:", err);
      setError(err.message || "Failed to create Contriboost");
      toast.error("Failed to create Contriboost");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Create Contriboost Pool</h1>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Select Network</CardTitle>
          <CardDescription>Choose the blockchain network for your pool</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant={selectedNetwork === "lisk" ? "default" : "outline"}
              onClick={() => handleNetworkSwitch("lisk")}
              disabled={isCreating}
              className="h-20"
            >
              <div className="text-center">
                <div className="font-bold">Lisk</div>
                <div className="text-xs text-muted-foreground">ETH / USDT</div>
              </div>
            </Button>
            <Button
              variant={selectedNetwork === "celo" ? "default" : "outline"}
              onClick={() => handleNetworkSwitch("celo")}
              disabled={isCreating}
              className="h-20"
            >
              <div className="text-center">
                <div className="font-bold">Celo</div>
                <div className="text-xs text-muted-foreground">CELO / cUSD</div>
              </div>
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {selectedNetwork && (
        <Card>
          <CardHeader>
            <CardTitle>Pool Details</CardTitle>
            <CardDescription>Configure your new Contriboost rotating savings pool</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pool Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Friends Savings Pool" {...field} />
                      </FormControl>
                      <FormDescription>A descriptive name for your Contriboost pool</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Weekly savings pool for our friend group" {...field} />
                      </FormControl>
                      <FormDescription>Explain the purpose of this pool to potential participants</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="dayRange"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Days Per Cycle</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} />
                        </FormControl>
                        <FormDescription>Number of days in each distribution cycle</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expectedNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Participants</FormLabel>
                        <FormControl>
                          <Input type="number" min="2" {...field} />
                        </FormControl>
                        <FormDescription>Maximum number of participants in the pool</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="contributionAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contribution Amount</FormLabel>
                        <FormControl>
                          <Input placeholder="0.1" {...field} />
                        </FormControl>
                        <FormDescription>
                          Amount each participant contributes per cycle (in {selectedNetwork === "lisk" ? "ETH or USDT" : "CELO or cUSD"})
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex flex-col space-y-1"
                          >
                            <FormItem className="flex items-center space-x-3 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="0" />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {selectedNetwork === "lisk" ? "Ether (ETH)" : "CELO (Native)"}
                              </FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="1" />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {selectedNetwork === "lisk" ? "USDT (Stablecoin)" : "cUSD (Stablecoin)"}
                              </FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="hostFeePercentage"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel>Host Fee Percentage</FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="w-[200px] text-xs">
                                  The percentage fee you receive as the host of this pool. Max 5%.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <Input type="number" min="0" max="5" step="0.1" {...field} />
                        </FormControl>
                        <FormDescription>Your fee for hosting (0-5%)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxMissedDeposits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Missed Deposits</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" {...field} />
                        </FormControl>
                        <FormDescription>
                          How many deposits a participant can miss before becoming inactive
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="startTimestamp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          {...field}
                          min={new Date().toISOString().slice(0, 16)}
                        />
                      </FormControl>
                      <FormDescription>When the first cycle will begin</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <CardFooter className="flex justify-end px-0">
                  <Button variant="outline" type="submit" disabled={isCreating || !selectedNetwork}>
                    {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Pool
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}