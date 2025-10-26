"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress, parseEther } from "ethers";
import { useWeb3 } from "@/components/providers/web3-provider";
import { createGoalFund } from "@/lib/contract";
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
// Import Divvi utilities
import { generateDivviTag, submitDivviReferral } from "@/lib/divvi-utils";

const CONTRACT_ADDRESSES = {
  celo: {
    factory: "0x64547A48C57583C8f595D97639543E2f1b6db4a6",
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
  targetAmount: z.string().refine(
    (value) => {
      try {
        return parseEther(value) > 0n;
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
    { message: "Deadline date and time must be in the future" }
  ),
  beneficiary: z.string().refine(isAddress, { message: "Must be a valid Ethereum address" }),
  fundType: z.enum(["0", "1"]),
  tokenType: z.enum(["celo", "cusd"]),
});

export default function CreateGoalFundPage() {
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
      targetAmount: "1",
      deadline: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
      beneficiary: account || "",
      fundType: "0",
      tokenType: "celo",
    },
  });

  const fundType = form.watch("fundType");

  useEffect(() => {
    if (account && fundType === "1") {
      form.setValue("beneficiary", account);
    }
  }, [account, fundType, form]);

  useEffect(() => {
    console.log("ChainId changed:", chainId);
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
        toast.error("Unsupported network");
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
        values.tokenType === "cusd"
          ? CONTRACT_ADDRESSES[selectedNetwork].cusd
          : CONTRACT_ADDRESSES[selectedNetwork].celo;

      console.log("Submitting GoalFund:", {
        chain: JSON.stringify(chain, null, 2),
        chainId: SUPPORTED_CHAINS[selectedNetwork],
        name: values.name,
        description: values.description,
        targetAmount: values.targetAmount,
        deadline: values.deadline,
        beneficiary: values.beneficiary,
        paymentMethod: 1,
        tokenAddress,
        fundType: values.fundType,
        walletType,
        account,
      });

      const { receipt, newContractAddress } = await createGoalFund({
        client: thirdwebClient,
        chain,
        chainId: SUPPORTED_CHAINS[selectedNetwork],
        name: values.name,
        description: values.description,
        targetAmount: parseEther(values.targetAmount),
        deadline: Math.floor(new Date(values.deadline).getTime() / 1000),
        beneficiary: values.beneficiary,
        paymentMethod: 1,
        tokenAddress,
        fundType: Number(values.fundType),
      });

      // 🎯 DIVVI INTEGRATION START
      // Step 1: Generate Divvi referral tag for this user
      const referralTag = generateDivviTag(account);
      console.log("🏷️ Generated Divvi referral tag");

      // Step 2: Populate the transaction to get the data field
      const populatedTx = await factoryContract.createGoalFund.populateTransaction(
        values.name,
        values.description,
        ethers.parseEther(values.targetAmount),
        Math.floor(new Date(values.deadline).getTime() / 1000),
        values.beneficiary,
        Number(values.paymentMethod),
        tokenAddress,
        Number(values.fundType)
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

      if (goalFundCreatedEvent) {
        const parsedEvent = factoryContract.interface.parseLog(goalFundCreatedEvent);
        const newGoalFundAddress = parsedEvent.args.goalFund;
        console.log("New GoalFund created at:", newGoalFundAddress);
        toast.success("GoalFund created successfully!");
        router.push(`/pools/details/${newGoalFundAddress}?network=${selectedNetwork}`);
      } else {
        toast.success("GoalFund created successfully!");
        router.push("/pools");
      }
    } catch (err) {
      console.error("Error creating GoalFund:", err);
      setError(err.message || "Failed to create GoalFund");
      toast.error("Failed to create GoalFund");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Create GoalFund</h1>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Select Network</CardTitle>
          <CardDescription>Choose the blockchain network for your fund</CardDescription>
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
                          Amount you aim to raise (in CELO or cUSD ERC20 tokens)
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
                          <Input
                            type="datetime-local"
                            {...field}
                            min={new Date().toISOString().slice(0, 16)}
                          />
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
                        <Input placeholder="0x..." {...field} disabled={fundType === "1"} />
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
                      <FormLabel>Token Type</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-2"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="celo" />
                            </FormControl>
                            <FormLabel className="font-normal">CELO (ERC20)</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="cusd" />
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
                <div className="flex justify-end pt-4">
                  <Button
                    variant="outline"
                    type="submit"
                    disabled={isCreating || !selectedNetwork}
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
      )}
    </div>
  );
}