"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ethers } from "ethers"
import { useWeb3 } from "@/components/providers/web3-provider"
import { ContriboostFactoryAbi } from "@/lib/contractabi"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Loader2, Info } from "lucide-react"

// Define contract factory address - should come from environment or config
const FACTORY_ADDRESS = "0xYourContractAddressHere"

const formSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  description: z.string().min(10, { message: "Description must be at least 10 characters" }),
  targetAmount: z.string().refine(
    (value) => {
      try {
        return ethers.parseEther(value) > 0n
      } catch {
        return false
      }
    },
    { message: "Must be a valid amount greater than 0" },
  ),
  deadline: z.string().refine(
    (value) => {
      const date = new Date(value)
      return !isNaN(date.getTime()) && date > new Date()
    },
    { message: "Deadline must be in the future" },
  ),
  beneficiary: z.string().refine(
    (value) => {
      try {
        return ethers.isAddress(value)
      } catch {
        return false
      }
    },
    { message: "Must be a valid Ethereum address" },
  ),
  fundType: z.enum(["0", "1"]), // 0 for Group, 1 for Personal
  paymentMethod: z.enum(["0", "1"]), // 0 for ETH, 1 for ERC20
  tokenAddress: z.string().optional(),
  hostFeePercentage: z.coerce.number().min(0).max(5, { message: "Fee must be between 0% and 5%" }),
})

export default function CreateGoalFundPage() {
  const router = useRouter()
  const { signer, account } = useWeb3()
  const [isCreating, setIsCreating] = useState(false)

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      targetAmount: "1",
      deadline: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0], // 30 days from now
      beneficiary: account || "",
      fundType: "0", // Default to Group
      paymentMethod: "0", // Default to ETH
      tokenAddress: "",
      hostFeePercentage: 2,
    },
  })

  const paymentMethod = form.watch("paymentMethod")
  const fundType = form.watch("fundType")

  // Update beneficiary field when account changes (if Personal fund type)
  useState(() => {
    if (account && fundType === "1") {
      form.setValue("beneficiary", account)
    }
  })

  async function onSubmit(values) {
    if (!signer || !account) {
      alert("Please connect your wallet first")
      return
    }

    setIsCreating(true)
    try {
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, ContriboostFactoryAbi, signer)

      // Convert form values to the expected format for the contract
      const tokenAddress =
        values.paymentMethod === "1" && values.tokenAddress ? values.tokenAddress : ethers.ZeroAddress

      // Call the createGoalFund function on the factory
      const tx = await factoryContract.createGoalFund(
        values.name,
        values.description,
        ethers.parseEther(values.targetAmount),
        Math.floor(new Date(values.deadline).getTime() / 1000),
        values.beneficiary,
        Number(values.paymentMethod),
        tokenAddress,
        Number(values.fundType),
      )

      await tx.wait()

      alert("GoalFund created successfully!")
      router.push("/account")
    } catch (error) {
      console.error("Error creating GoalFund:", error)
      alert(`Error creating GoalFund: ${error.message || "Unknown error"}`)
    } finally {
      setIsCreating(false)
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
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Create GoalFund</h1>
      <p className="text-muted-foreground mb-8">Deploy a new goal-based funding campaign</p>

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
                          field.onChange(value)
                          // Auto-set beneficiary to current account for Personal funds
                          if (value === "1" && account) {
                            form.setValue("beneficiary", account)
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
                        disabled={fundType === "1"} // Disable for Personal funds
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
                                The percentage fee you receive as the host of this fund. Max 5%.
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
  )
}
