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
      try {
        toast.error("Failed to switch network: " + err.message);
      } catch (toastError) {
        console.error("Toast error:", toastError);
      }
    }
  }

  async function onSubmit(values) {
    if (!account) {
      await connect();
      if (!account) {
        setError("Please connect your wallet first");
        try {
          toast.warning("Please connect your wallet first");
        } catch (toastError) {
          console.error("Toast error:", toastError);
        }
        return;
      }
    }

    if (!selectedNetwork) {
      setError("Please select a supported network (Celo Alfajores)");
      try {
        toast.error("Select a supported network");
      } catch (toastError) {
        console.error("Toast error:", toastError);
      }
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const chain = selectedNetwork === "celo" ? celoAlfajores : null;
      if (!chain) {
        throw new Error("Invalid chain configuration for selected network");
      }

      const tokenAddress =
        values.tokenType === "1"
          ? CONTRACT_ADDRESSES[selectedNetwork].cusd
          : CONTRACT_ADDRESSES[selectedNetwork].celo;

      const config = {
        dayRange: Number(values.dayRange),
        expectedNumber: Number(values.expectedNumber),
        contributionAmount: parseEther(values.contributionAmount),
        hostFeePercentage: Number(values.hostFeePercentage) * 100,
        platformFeePercentage: 100,
        maxMissedDeposits: Number(values.maxMissedDeposits),
        startTimestamp: Math.floor(new Date(values.startTimestamp).getTime() / 1000),
        paymentMethod: 1,
      };

      console.log("Submitting Contriboost:", {
        chain: JSON.stringify(chain, null, 2),
        chainId: SUPPORTED_CHAINS[selectedNetwork],
        config,
        name: values.name,
        description: values.description,
        tokenAddress,
        walletType,
        account,
      });

      const { receipt, newContractAddress } = await createContriboost({
        client: thirdwebClient,
        chain,
        chainId: SUPPORTED_CHAINS[selectedNetwork],
        config,
        name: values.name,
        description: values.description,
        tokenAddress,
        account: signer,
        walletType,
      });

      console.log("Transaction receipt:", {
        transactionHash: receipt.transactionHash,
        walletType,
        logs: receipt.logs || "No logs available",
        events: receipt.events || "No events available",
      });

      try {
        toast.success("Contriboost pool created successfully!");
      } catch (toastError) {
        console.error("Toast error:", toastError);
      }
      router.push(`/pools?created=true`);
    } catch (error) {
      console.error("Error creating Contriboost:", error);
      let message = "Failed to create Contriboost pool. Please try again.";
      if (error.message.includes("invalid chain")) {
        message = "Invalid chain configuration. Ensure Celo Alfajores is selected.";
      } else if (error.message.includes("invalid token address")) {
        message = "Invalid token address. Please select CELO or cUSD.";
      } else if (error.message.includes("startTimestamp")) {
        message = "Start date must be in the future.";
      } else if (error.message.includes("insufficient funds")) {
        message = "Insufficient funds for gas or token approval.";
      } else if (error.message.includes("USER_REJECTED")) {
        message = "Transaction rejected by wallet.";
      } else if (error.message.includes("Could not find ContriboostCreated event")) {
        message = "Failed to parse contract creation event. Please check the transaction details.";
      } else if (error.message.includes("UserOp failed")) {
        message = "Transaction simulation failed for smart wallet. Ensure your wallet has sufficient CELO for gas.";
      }
      setError(message);
      try {
        toast.error(message);
      } catch (toastError) {
        console.error("Toast error:", toastError);
      }
      router.push(`/pools?created=true`);
    } finally {
      setIsCreating(false);
    }
  }

  if (!account) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="mb-6 text-muted-foreground">Please connect your wallet to create a Contriboost pool</p>
        <Button onClick={connect} className="mr-4">
          Connect MetaMask
        </Button>
        <Button onClick={() => connectInAppWallet("guest")} className="mr-4">
          Connect as Guest
        </Button>
        <Button variant="outline" asChild>
          <a href="/">Go Home</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Create Contriboost Pool</h1>
      <p className="text-muted-foreground mb-8">Deploy a new rotating savings pool for your community on Celo Alfajores</p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Network</CardTitle>
          <CardDescription>Choose the blockchain network for your pool</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button
              variant={selectedNetwork === "celo" ? "default" : "outline"}
              onClick={() => handleNetworkSwitch("celo")}
              disabled={isCreating || chainId === SUPPORTED_CHAINS.celo || !account || walletType === "smart"}
            >
              Celo Alfajores
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
                        Amount each participant contributes per cycle (in CELO or cUSD ERC20 tokens)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tokenType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Token Type</FormLabel>
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
                            <FormLabel className="font-normal">CELO (ERC20)</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="1" />
                            </FormControl>
                            <FormLabel className="font-normal">cUSD (ERC20)</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormDescription className="text-xs sm:text-sm">
                        Select the ERC20 token for contributions
                      </FormDescription>
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