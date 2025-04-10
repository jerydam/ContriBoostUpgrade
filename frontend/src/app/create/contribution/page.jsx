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
  dayRange: z.coerce.number().int().min(1, { message: "Must be at least 1 day" }),
  expectedNumber: z.coerce.number().int().min(2, { message: "Must have at least 2 participants" }),
  contributionAmount: z.string().refine(
    (value) => {
      try {
        return ethers.parseEther(value) > 0n
      } catch {
        return false
      }
    },
    { message: "Must be a valid amount greater than 0" },
  ),
  paymentMethod: z.enum(["0", "1"]), // 0 for ETH, 1 for ERC20
  tokenAddress: z.string().optional(),
  hostFeePercentage: z.coerce.number().min(0).max(5, { message: "Fee must be between 0% and 5%" }),
  maxMissedDeposits: z.coerce.number().int().min(0, { message: "Must be 0 or more" }),
  startTimestamp: z.string().refine(
    (value) => {
      const date = new Date(value)
      return !isNaN(date.getTime()) && date > new Date()
    },
    { message: "Start date must be in the future" },
  ),
})

export default function CreateContriboostPage() {
  const router = useRouter()
  const { signer, account } = useWeb3()
  const [isCreating, setIsCreating] = useState(false)

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      dayRange: 7,
      expectedNumber: 10,
      contributionAmount: "0.1",
      paymentMethod: "0", // Default to ETH
      tokenAddress: "",
      hostFeePercentage: 2,
      maxMissedDeposits: 2,
      startTimestamp: new Date(Date.now() + 86400000).toISOString().split("T")[0], // Tomorrow
    },
  })

  const paymentMethod = form.watch("paymentMethod")

  async function onSubmit(values) {
    if (!signer || !account) {
      alert("Please connect your wallet first")
      return
    }

    setIsCreating(true)
    try {
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, ContriboostFactoryAbi, signer)

      // Convert form values to the expected format for the contract
      const config = {
        dayRange: values.dayRange,
        expectedNumber: values.expectedNumber,
        contributionAmount: ethers.parseEther(values.contributionAmount),
        hostFeePercentage: values.hostFeePercentage * 100, // Convert to basis points (e.g., 2% becomes 200)
        platformFeePercentage: 50, // 0.5% as basis points, could be configurable
        maxMissedDeposits: values.maxMissedDeposits,
        startTimestamp: Math.floor(new Date(values.startTimestamp).getTime() / 1000),
        paymentMethod: Number(values.paymentMethod),
      }

      const tokenAddress =
        values.paymentMethod === "1" && values.tokenAddress ? values.tokenAddress : ethers.ZeroAddress

      // Call the createContriboost function on the factory
      const tx = await factoryContract.createContriboost(config, values.name, values.description, tokenAddress)

      await tx.wait()

      alert("Contriboost pool created successfully!")
      router.push("/pools")
    } catch (error) {
      console.error("Error creating Contriboost:", error)
      alert(`Error creating Contriboost: ${error.message || "Unknown error"}`)
    } finally {
      setIsCreating(false)
    }
  }

  if (!account) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="mb-6 text-muted-foreground">Please connect your wallet to create a Contriboost pool</p>
        <Button asChild>
          <a href="/">Go Home</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Create Contriboost Pool</h1>
      <p className="text-muted-foreground mb-8">Deploy a new rotating savings pool for your community</p>

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
                        Amount each participant contributes per cycle (in ETH or tokens)
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
                      <FormDescription>Address of the ERC20 token contract to use for this pool</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
                <Button type="submit" disabled={isCreating}>
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Pool
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
