"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import { GoalFundFactoryAbi } from "@/lib/contractabi";
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
import { AlertCircle, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Contract address
const FACTORY_ADDRESS = "0x139814961a3D4D834E20101ECDd84e9e882D2bd9";

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
  fundType: z.enum(["0", "1"]), // 0 for Group, 1 for Personal
  paymentMethod: z.enum(["0", "1"]), // 0 for ETH, 1 for ERC20
  tokenAddress: z.string().refine(
    (value) => !value || ethers.isAddress(value),
    { message: "Must be a valid Ethereum address if provided" }
  ).optional(),
});

export default function CreateGoalFundPage() {
  const router = useRouter();
  const { signer, account } = useWeb3();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      targetAmount: "1",
      deadline: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0], // 30 days from now
      beneficiary: account || "",
      fundType: "0",
      paymentMethod: "0",
      tokenAddress: "",
    },
  });

  const paymentMethod = form.watch("paymentMethod");
  const fundType = form.watch("fundType");

  useEffect(() => {
    if (account && fundType === "1") {
      form.setValue("beneficiary", account);
    }
  }, [account, fundType, form]);

  async function onSubmit(values) {
    if (!signer || !account) {
      setError("Please connect your wallet first");
      return;
    }

    // Clear any previous errors
    setError(null);
    setIsCreating(true);
    
    try {
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, GoalFundFactoryAbi, signer);

      const tokenAddress = values.paymentMethod === "1" && values.tokenAddress ? values.tokenAddress : ethers.ZeroAddress;

      console.log("Creating GoalFund with values:", {
        name: values.name,
        description: values.description,
        targetAmount: ethers.parseEther(values.targetAmount).toString(),
        deadline: Math.floor(new Date(values.deadline).getTime() / 1000),
        beneficiary: values.beneficiary,
        paymentMethod: Number(values.paymentMethod),
        tokenAddress,
        fundType: Number(values.fundType)
      });

      // Estimate gas to catch potential errors before sending transaction
      const estimatedGas = await factoryContract.createGoalFund.estimateGas(
        values.name,
        values.description,
        ethers.parseEther(values.targetAmount),
        Math.floor(new Date(values.deadline).getTime() / 1000),
        values.beneficiary,
        Number(values.paymentMethod),
        tokenAddress,
        Number(values.fundType)
      );
      
      // Add 20% buffer to gas estimate
      const gasLimit = Math.floor(Number(estimatedGas) * 1.2);

      const tx = await factoryContract.createGoalFund(
        values.name,
        values.description,
        ethers.parseEther(values.targetAmount),
        Math.floor(new Date(values.deadline).getTime() / 1000),
        values.beneficiary,
        Number(values.paymentMethod),
        tokenAddress,
        Number(values.fundType),
        { gasLimit }
      );
      
      console.log("Transaction sent:", tx.hash);
      
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);

      alert("GoalFund created successfully!");
      router.push(`/funds/${receipt.logs[0].address}`); // Redirect to new fund address
    } catch (error) {
      console.error("Error creating GoalFund:", error);
      
      // Handle specific error cases
      if (error.code === 4001) {
        setError("Transaction rejected: Please confirm the transaction in your wallet");
      } else if (error.code === 4100) {
        setError("Authorization needed: Please unlock your wallet and approve the transaction");
      } else if (error.code === -32603) {
        setError("Transaction failed: You may have insufficient funds for gas or the contract call failed");
      } else {
        setError(`Error: ${error.reason || error.message || "Transaction failed. Please try again."}`);
      }
    } finally {
      setIsCreating(false);
    }
  }

  if (!account) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="mb-6 text-muted-foreground">Please connect your wallet to create a GoalFund</p>
        <Button asChild>
          <a href="/">Go Home</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Create GoalFund</h1>
      <p className="text-muted-foreground mb-8">Deploy a new goal-based funding campaign</p>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Fund Details</CardTitle>
          <CardDescription>Configure your new GoalFund campaign</CardDescription>
        </CardHeader>
        <CardContent>
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
                    <FormDescription>A clear name for your funding campaign</FormDescription>
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
                      <Textarea placeholder="Raising funds to support our local community garden" {...field} />
                    </FormControl>
                    <FormDescription>Explain the purpose of this fund to potential contributors</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="targetAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Amount</FormLabel>
                      <FormControl>
                        <Input placeholder="1" {...field} />
                      </FormControl>
                      <FormDescription>Amount you aim to raise (in ETH or tokens)</FormDescription>
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
                      <FormDescription>When the funding campaign will end</FormDescription>
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
                        className="flex flex-col space-y-1"
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
                    <FormDescription>Group funds allow refunding contributors if the goal isn't met</FormDescription>
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
                    <FormDescription>
                      {fundType === "1"
                        ? "For personal funds, you are automatically the beneficiary"
                        : "Address that will receive the funds when the goal is met"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            <FormLabel className="font-normal">Ether (ETH)</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="1" />
                            </FormControl>
                            <FormLabel className="font-normal">ERC20 Token</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {paymentMethod === "1" && (
                <FormField
                  control={form.control}
                  name="tokenAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Token Address</FormLabel>
                      <FormControl>
                        <Input placeholder="0x..." {...field} />
                      </FormControl>
                      <FormDescription>Address of the ERC20 token contract to use for this fund</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <CardFooter className="flex justify-end px-0">
                <Button type="submit" disabled={isCreating}>
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Fund
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}