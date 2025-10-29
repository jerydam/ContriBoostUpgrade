"use client";

import { useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Loader2, Info, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "react-toastify";
// 🔵 DIVVI INTEGRATION: Import Divvi utilities
import { appendDivviTag, submitDivviReferral } from "@/lib/divvi-utils";

const FACTORY_ADDRESS = "0x9A22564FfeB76a022b5174838660AD2c6900f291";
const CELO_ADDRESS = "0x471ece3750da237f93b8e339c536989b8978a438";
const CUSD_ADDRESS = "0x765de816845861e75a25fca122bb6898b8b1282a";

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
  tokenType: z.enum(["CELO", "cUSD"]),
  hostFeePercentage: z.coerce.number().min(0).max(5, { message: "Fee must be between 0% and 5%" }),
  maxMissedDeposits: z.coerce.number().int().min(0, { message: "Must be 0 or more" }),
  startTimestamp: z.string().refine(
    (value) => {
      const date = new Date(value);
      return !isNaN(date.getTime()) && date > new Date();
    },
    { message: "Start date must be in the future" }
  ),
});

export default function CreateContriboostPage() {
  const router = useRouter();
  // 🔵 DIVVI INTEGRATION: Get chainId from Web3 context
  const { signer, account, chainId, connect } = useWeb3();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      dayRange: 7,
      expectedNumber: 10,
      contributionAmount: "0.1",
      tokenType: "CELO",
      hostFeePercentage: 2,
      maxMissedDeposits: 2,
      startTimestamp: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    },
  });

  async function onSubmit(values) {
    if (!signer || !account) {
      await connect();
      if (!account) {
        setError("Please connect your wallet first");
        toast.warning("Please connect your wallet first");
        return;
      }
    }

    setError(null);
    setIsCreating(true);

    try {
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, ContriboostFactoryAbi, signer);
      
      const paymentMethod = 1;
      const tokenAddress = values.tokenType === "cUSD" ? CUSD_ADDRESS : CELO_ADDRESS;
      
      const config = {
        dayRange: values.dayRange,
        expectedNumber: values.expectedNumber,
        contributionAmount: ethers.parseEther(values.contributionAmount),
        hostFeePercentage: values.hostFeePercentage * 100,
        platformFeePercentage: 50,
        maxMissedDeposits: values.maxMissedDeposits,
        startTimestamp: Math.floor(new Date(values.startTimestamp).getTime() / 1000),
        paymentMethod: paymentMethod,
      };

      console.log("Creating Contriboost with config:", config, "Token address:", tokenAddress);

      // 🔵 DIVVI INTEGRATION: Get populated transaction to extract data
      const populatedTx = await factoryContract.createContriboost.populateTransaction(
        config,
        values.name,
        values.description,
        tokenAddress
      );

      // 🔵 DIVVI INTEGRATION: Append Divvi referral tag to transaction data
      const dataWithTag = appendDivviTag(populatedTx.data, account);

      // Estimate gas for the modified transaction
      const estimatedGas = await signer.estimateGas({
        to: FACTORY_ADDRESS,
        data: dataWithTag,
      });
      const gasLimit = Math.floor(Number(estimatedGas) * 1.2);

      // 🔵 DIVVI INTEGRATION: Send transaction with Divvi-tagged data
      const tx = await signer.sendTransaction({
        to: FACTORY_ADDRESS,
        data: dataWithTag,
        gasLimit,
      });

      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);

      // 🔵 DIVVI INTEGRATION: Submit referral to Divvi after transaction confirmation
      await submitDivviReferral(receipt.hash || tx.hash, chainId);

      console.log("Receipt logs:", receipt.logs);

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
      console.log("Parsed ContriboostCreated event:", parsedLog);
      const newContractAddress = parsedLog.args.contriboostAddress;

      if (!ethers.isAddress(newContractAddress)) {
        throw new Error("Invalid contract address received from ContriboostCreated event");
      }

      toast.success("Contriboost pool created successfully!");
      setTimeout(() => {
        router.push(`/pools/details/${newContractAddress}`);
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

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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
                        Amount each participant contributes per cycle
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
                      <FormLabel>Token</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="CELO" />
                            </FormControl>
                            <FormLabel className="font-normal">CELO</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="cUSD" />
                            </FormControl>
                            <FormLabel className="font-normal">cUSD</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormDescription>Choose the token for contributions</FormDescription>
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
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>When the first cycle will begin</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <CardFooter className="flex justify-end px-0">
                <Button variant="outline" type="submit" disabled={isCreating}>
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Pool
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}