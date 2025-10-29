"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import { GoalFundFactoryAbi } from "@/lib/contractabi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "react-toastify";
// 🔵 DIVVI INTEGRATION
import { appendDivviTag, submitDivviReferral } from "@/lib/divvi-utils";

const FACTORY_ADDRESS = "0x41A678AA87755Be471A4021521CeDaCB0F529D7c";
const CELO_ADDRESS = "0x471ece3750da237f93b8e339c536989b8978a438";
const CUSD_ADDRESS = "0x765de816845861e75a25fca122bb6898b8b1282a";

const formSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  description: z.string().min(10, { message: "Description must be at least 10 characters" }),
  targetAmount: z.string().refine(
    (value) => {
      try {
        return ethers.parseEther(value) > 0n;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid amount greater than 0" }
  ),
  deadline: z.string().refine(
    (value) => {
      const date = new Date(value);
      return !isNaN(date.getTime()) && date > new Date();
    },
    { message: "Deadline must be in the future" }
  ),
  beneficiary: z.string().refine(ethers.isAddress, { message: "Must be a valid Ethereum address" }),
  fundType: z.enum(["0", "1"]),
  tokenType: z.enum(["CELO", "cUSD"]),
});

export default function CreateGoalFundPage() {
  const router = useRouter();
  // 🔵 DIVVI INTEGRATION: Added chainId to destructuring
  const { signer, account, chainId, connect } = useWeb3();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      targetAmount: "1",
      deadline: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      beneficiary: account || "",
      fundType: "0",
      tokenType: "CELO",
    },
  });

  const fundType = form.watch("fundType");

  useEffect(() => {
    if (account && fundType === "1") {
      form.setValue("beneficiary", account);
    }
  }, [account, fundType, form]);

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
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, GoalFundFactoryAbi, signer);
      
      const paymentMethod = 1;
      const tokenAddress = values.tokenType === "cUSD" ? CUSD_ADDRESS : CELO_ADDRESS;

      console.log("Creating GoalFund with values:", {
        name: values.name,
        description: values.description,
        targetAmount: ethers.parseEther(values.targetAmount).toString(),
        deadline: Math.floor(new Date(values.deadline).getTime() / 1000),
        beneficiary: values.beneficiary,
        paymentMethod: paymentMethod,
        tokenAddress,
        fundType: Number(values.fundType),
      });

      // 🔵 DIVVI STEP 1: Get populated transaction
      const populatedTx = await factoryContract.createGoalFund.populateTransaction(
        values.name,
        values.description,
        ethers.parseEther(values.targetAmount),
        Math.floor(new Date(values.deadline).getTime() / 1000),
        values.beneficiary,
        paymentMethod,
        tokenAddress,
        Number(values.fundType)
      );

      // 🔵 DIVVI STEP 2: Append Divvi referral tag
      const dataWithTag = appendDivviTag(populatedTx.data, account);

      // Estimate gas for the modified transaction
      const estimatedGas = await signer.estimateGas({
        to: FACTORY_ADDRESS,
        data: dataWithTag,
      });
      const gasLimit = Math.floor(Number(estimatedGas) * 1.2);

      // 🔵 DIVVI STEP 3: Send transaction with Divvi-tagged data
      const tx = await signer.sendTransaction({
        to: FACTORY_ADDRESS,
        data: dataWithTag,
        gasLimit,
      });

      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);

      // 🔵 DIVVI STEP 4: Submit referral to Divvi
      await submitDivviReferral(receipt.hash || tx.hash, chainId);

      console.log("Receipt logs:", receipt.logs);

      const goalFundCreatedEvent = receipt.logs.find(
        (log) => {
          try {
            const parsedLog = factoryContract.interface.parseLog(log);
            return parsedLog?.name === "GoalFundCreated";
          } catch {
            return false;
          }
        }
      );

      if (!goalFundCreatedEvent) {
        throw new Error("Could not find GoalFundCreated event in transaction receipt");
      }

      const parsedLog = factoryContract.interface.parseLog(goalFundCreatedEvent);
      console.log("Parsed GoalFundCreated event:", parsedLog);
      const newContractAddress = parsedLog.args.goalFundAddress;

      if (!ethers.isAddress(newContractAddress)) {
        throw new Error("Invalid contract address received from GoalFundCreated event");
      }

      toast.success("GoalFund created successfully!");
      setTimeout(() => {
        router.push(`/pools/details/${newContractAddress}`);
      }, 500);
    } catch (error) {
      console.error("Error creating GoalFund:", error);
      let message = "Transaction failed. Please try again.";
      if (error.code === 4001) {
        message = "Transaction rejected by wallet";
      } else if (error.code === 4100) {
        message = "Wallet authorization needed";
      } else if (error.code === -32603) {
        message = "Insufficient funds for gas or contract error";
      } else if (error.reason) {
        message = error.reason;
      } else if (error.message.includes("GoalFundCreated event")) {
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
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="mb-6 text-muted-foreground">Please connect your wallet to create a GoalFund</p>
        <Button variant="outline" asChild>
          <a href="/">Go Home</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">Create GoalFund</h1>
      <p className="text-muted-foreground mb-8 text-sm sm:text-base">
        Deploy a new goal-based funding campaign
      </p>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">Fund Details</CardTitle>
          <CardDescription className="text-sm">
            Configure your new GoalFund campaign
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fund Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Community Project Fund" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs sm:text-sm">
                      A clear name for your funding campaign
                    </FormDescription>
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
                      <Textarea
                        placeholder="Raising funds to support our local community garden"
                        {...field}
                        className="min-h-[100px]"
                      />
                    </FormControl>
                    <FormDescription className="text-xs sm:text-sm">
                      Explain the purpose of this fund to potential contributors
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <FormField
                  control={form.control}
                  name="targetAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Amount</FormLabel>
                      <FormControl>
                        <Input placeholder="1" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs sm:text-sm">
                        Amount you aim to raise
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deadline</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs sm:text-sm">
                        When the funding campaign will end
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="fundType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fund Type</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value === "1" && account) {
                            form.setValue("beneficiary", account);
                          }
                        }}
                        defaultValue={field.value}
                        className="flex flex-col space-y-2"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="0" />
                          </FormControl>
                          <FormLabel className="font-normal">Group Fund</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="1" />
                          </FormControl>
                          <FormLabel className="font-normal">Personal Fund</FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormDescription className="text-xs sm:text-sm">
                      Group funds allow refunding contributors if the goal isn't met
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="beneficiary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beneficiary</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="0x..."
                        {...field}
                        disabled={fundType === "1"}
                      />
                    </FormControl>
                    <FormDescription className="text-xs sm:text-sm">
                      {fundType === "1"
                        ? "For personal funds, you are automatically the beneficiary"
                        : "Address that will receive the funds when the goal is met"}
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
                        className="flex flex-col space-y-2"
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
                    <FormDescription className="text-xs sm:text-sm">
                      Choose the token for contributions
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end pt-4">
                <Button
                  variant="outline"
                  type="submit"
                  disabled={isCreating}
                  className="w-full sm:w-auto"
                >
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Fund
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}