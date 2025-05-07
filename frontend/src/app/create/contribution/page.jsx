"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import { ContriboostFactoryAbi } from "@/lib/contractabi";
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

// Contract addresses
const CONTRACT_ADDRESSES = {
  lisk: {
    factory: "0xF122b07B2730c6056114a5507FA1A776808Bf0A4", // Placeholder; replace with Lisk Sepolia factory address
    usdt: "0x46d96167DA9E15aaD148c8c68Aa1042466BA6EEd", // Placeholder; replace with Lisk Sepolia stablecoin address
    native: ethers.ZeroAddress, // ETH for Lisk Sepolia
  },
  celo: {
    factory: "0x8DE33AbcC5eB868520E1ceEee5137754cb3A558c", // Celo Alfajores Contriboost factory
    cusd: "0xFE18f2C089f8fdCC843F183C5aBdeA7fa96C78a8", // cUSD for Alfajores
    native: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9", // CELO native token address
  },
};

// Supported chain IDs
const SUPPORTED_CHAINS = {
  lisk: 4202, // Lisk Sepolia
  celo: 44787, // Celo Alfajores
};

const formSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  description: z.string().min(10, { message: "Description must be at least 10 characters" }),
  dayRange: z.coerce.number().int().min(1, { message: "Must be at least 1 day" }),
  expectedNumber: z.coerce.number().int().min(2, { message: "Must have at least 2 participants" }),
  contributionAmount: z.string().refine(
    (value) => {
      try {
        return ethers.parseEther(value) > 0n;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid amount greater than 0" }
  ),
  paymentMethod: z.enum(["0", "1"]),
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
  const { signer, account, connect, supportsGasEstimation, chainId, switchNetwork } = useWeb3();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNetwork, setSelectedNetwork] = useState(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      dayRange: 7,
      expectedNumber: 10,
      contributionAmount: "0.1",
      paymentMethod: "0",
      hostFeePercentage: 2,
      maxMissedDeposits: 2,
      startTimestamp: new Date(Date.now() + 86400000).toISOString().slice(0, 16), // 1 day from now
    },
  });

  // Detect and validate network
  useEffect(() => {
    if (chainId) {
      if (chainId === SUPPORTED_CHAINS.lisk) {
        setSelectedNetwork("lisk");
      } else if (chainId === SUPPORTED_CHAINS.celo) {
        setSelectedNetwork("celo");
      } else {
        setError("Unsupported network. Please switch to Lisk Sepolia or Celo Alfajores.");
        setSelectedNetwork(null);
      }
    } else {
      setSelectedNetwork(null);
    }
  }, [chainId]);

  // Switch network if needed
  const handleNetworkSwitch = async (network) => {
    try {
      const targetChainId = SUPPORTED_CHAINS[network];
      await switchNetwork(targetChainId);
      setError(null);
      toast.info(`Switched to ${network === "lisk" ? "Lisk Sepolia" : "Celo Alfajores"} network`);
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
      setError("Please select a supported network (Lisk Sepolia or Celo Alfajores)");
      toast.error("Unsupported network");
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const factoryAddress = CONTRACT_ADDRESSES[selectedNetwork].factory;
      // Updated to use native token address for Celo and zero address for Lisk
      const tokenAddress =
        values.paymentMethod === "1"
          ? CONTRACT_ADDRESSES[selectedNetwork][selectedNetwork === "lisk" ? "usdt" : "cusd"]
          : CONTRACT_ADDRESSES[selectedNetwork].native;

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

      let tx;
      if (supportsGasEstimation) {
        const estimatedGas = await factoryContract.createContriboost.estimateGas(
          config,
          values.name,
          values.description,
          tokenAddress
        );
        const gasLimit = Math.floor(Number(estimatedGas) * 1.2);
        tx = await factoryContract.createContriboost(
          config,
          values.name,
          values.description,
          tokenAddress,
          { gasLimit }
        );
      } else {
        tx = await factoryContract.createContriboost(
          config,
          values.name,
          values.description,
          tokenAddress
        );
      }

      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);

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

      if (!contriboostCreatedEvent) {
        throw new Error("Could not find ContriboostCreated event in transaction receipt");
      }

      const parsedLog = factoryContract.interface.parseLog(contriboostCreatedEvent);
      const newContractAddress = parsedLog.args.contriboostAddress;

      if (!ethers.isAddress(newContractAddress)) {
        throw new Error("Invalid contract address received from ContriboostCreated event");
      }

      toast.success("Contriboost pool created successfully!");
      setTimeout(() => {
        router.push(`/pools/details/${newContractAddress}?network=${selectedNetwork}`);
      }, 500);
    } catch (error) {
      console.error("Error creating Contriboost:", error);
      let message = "Transaction failed. Please try again.";
      if (error.code === 4001) {
        message = "Transaction rejected by wallet";
      } else if (error.code === 4100) {
        message = "Wallet authorization needed";
      } else if (error.code === -32603) {
        message = "Insufficient funds for gas or contract error";
      } else if (error.reason) {
        message = error.reason;
      } else if (error.message.includes("ContriboostCreated event")) {
        message = "Failed to parse contract creation event";
      } else if (error.message.includes("Invalid contract address")) {
        message = "Invalid contract address received from transaction";
      } else if (error.message.includes("UNSUPPORTED_OPERATION") && error.operation === "estimateGas") {
        message = "Gas estimation not supported for this wallet. Please try again.";
      }
      setError(`Error: ${message}`);
      toast.error(`Error: ${message}`);
    } finally {
      setIsCreating(false);
    }
  }

  if (!account) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="mb-6 text-muted-foreground">Please connect your wallet to create a Contriboost pool</p>
        <Button variant="outline" asChild>
          <a href="/">Go Home</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Create Contriboost Pool</h1>
      <p className="text-muted-foreground mb-8">Deploy a new rotating savings pool for your community</p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Network</CardTitle>
          <CardDescription>Choose the blockchain network for your pool</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button
              variant={selectedNetwork === "lisk" ? "default" : "outline"}
              onClick={() => handleNetworkSwitch("lisk")}
              disabled={isCreating || chainId === SUPPORTED_CHAINS.lisk}
            >
              Lisk Sepolia
            </Button>
            <Button
              variant={selectedNetwork === "celo" ? "default" : "outline"}
              onClick={() => handleNetworkSwitch("celo")}
              disabled={isCreating || chainId === SUPPORTED_CHAINS.celo}
            >
              Celo Alfajores
            </Button>
          </div>
          {error && !selectedNetwork && (
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
                              <FormLabel className="font-normal">{selectedNetwork === "lisk" ? "Ether (ETH)" : "CELO"}</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="1" />
                              </FormControl>
                              <FormLabel className="font-normal">{selectedNetwork === "lisk" ? "USDT" : "cUSD"}</FormLabel>
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
                          min={new Date().toISOString().slice(0, 16)} // Prevent past dates
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