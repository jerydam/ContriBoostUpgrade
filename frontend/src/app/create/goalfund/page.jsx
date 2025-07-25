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
        toast.success("GoalFund created successfully!");
      } catch (toastError) {
        console.error("Toast error:", toastError);
      }
      router.push(`/pools?created=true`);
    } catch (error) {
      console.error("Error creating GoalFund:", error);
      let message = "Failed to create GoalFund. Please try again.";
      if (error.message.includes("invalid chain")) {
        message = "Invalid chain configuration. Ensure Celo Alfajores is selected.";
      } else if (error.message.includes("UserOp failed")) {
        message = "Transaction simulation failed for smart wallet. Ensure your wallet has sufficient CELO for gas.";
      } else if (error.message.includes("invalid token address")) {
        message = "Invalid token address. Please select CELO or cUSD.";
      } else if (error.message.includes("deadline")) {
        message = "Deadline must be in the future.";
      } else if (error.message.includes("insufficient funds")) {
        message = "Insufficient funds for gas or token approval.";
      } else if (error.message.includes("USER_REJECTED")) {
        message = "Transaction rejected by wallet.";
      } else if (error.message.includes("missing logs or events")) {
        message = `Failed to parse transaction receipt for ${walletType} wallet. Please try with a different wallet or contact support.`;
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
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="mb-6 text-muted-foreground">Please connect your wallet to create a GoalFund</p>
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
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">Create GoalFund</h1>
      <p className="text-muted-foreground mb-8 text-sm sm:text-base">
        Deploy a new goal-based funding campaign on Celo Alfajores
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Network</CardTitle>
          <CardDescription>Choose the blockchain network for your fund</CardDescription>
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