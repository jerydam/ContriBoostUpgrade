"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ethers } from "ethers"
import { useWeb3 } from "@/components/providers/web3-provider"
import { ContriboostFactoryAbi } from "@/lib/contractabi"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, PlusCircle, AlertCircle } from "lucide-react"

// Define contract factory address - should come from environment or config
const FACTORY_ADDRESS = "0xYourContractAddressHere" // Replace with actual address

export default function AccountPage() {
  const { provider, account } = useWeb3()
  const [balance, setBalance] = useState("0")
  const [userPools, setUserPools] = useState([])
  const [userFunds, setUserFunds] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    if (provider && account) {
      fetchUserData()
    } else {
      setIsLoading(false)
    }
  }, [provider, account])

  async function fetchUserData() {
    if (!provider || !account) return

    setIsLoading(true)
    try {
      // Fetch account balance
      const accountBalance = await provider.getBalance(account)
      setBalance(ethers.formatEther(accountBalance))

      // Fetch user's pools and funds
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, ContriboostFactoryAbi, provider)

      // Fetch user's Contriboost pools
      const userContriboostAddresses = await factoryContract.getUserContriboosts(account)
      const contriboostDetails = await Promise.all(
        userContriboostAddresses.map(async (address) => {
          const details = await factoryContract.getContriboostDetails(address)
          return {
            contractAddress: details.contractAddress,
            name: details.name,
            dayRange: Number(details.dayRange),
            expectedNumber: Number(details.expectedNumber),
            contributionAmount: details.contributionAmount,
            hostFeePercentage: Number(details.hostFeePercentage),
            currentParticipants: 0, // This would typically come from querying the contract
          }
        })
      )
      setUserPools(contriboostDetails)

      // Fetch user's GoalFunds
      const userGoalFundAddresses = await factoryContract.getUserGoalFunds(account)
      const goalFundDetails = await Promise.all(
        userGoalFundAddresses.map(async (address) => {
          const details = await factoryContract.getGoalFundDetails(address)
          return {
            contractAddress: details.contractAddress,
            name: details.name,
            targetAmount: details.targetAmount,
            currentAmount: details.currentAmount,
            deadline: Number(details.deadline),
            beneficiary: details.beneficiary,
            tokenAddress: details.tokenAddress,
            fundType: Number(details.fundType),
            platformFeePercentage: Number(details.platformFeePercentage),
          }
        })
      )
      setUserFunds(goalFundDetails)
    } catch (error) {
      console.error("Error fetching user data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString()
  }

  if (!account) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center max-w-md mx-auto">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-4">Wallet Not Connected</h1>
          <p className="text-muted-foreground mb-6">
            Please connect your wallet to view your account details, pools, and funds.
          </p>
          <Button asChild>
            <Link href="/">Go to Home</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>Loading your account data...</span>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">My Account</h1>
      <p className="text-muted-foreground mb-8">Manage your pools, funds, and contributions</p>

      {/* Wallet Overview */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Wallet Overview</CardTitle>
          <CardDescription>Your account details and balance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Address</h3>
                <p className="font-mono text-sm break-all">{account}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Balance</h3>
                <p className="text-xl font-bold">{balance} ETH</p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create New
              </Link>
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Tabs for different account sections */}
      <Tabs defaultValue="pools">
        <TabsList className="mb-6">
          <TabsTrigger value="pools">My Contriboost Pools</TabsTrigger>
          <TabsTrigger value="funds">My GoalFunds</TabsTrigger>
        </TabsList>

        <TabsContent value="pools">
          {userPools.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userPools.map((pool) => (
                <Card key={pool.contractAddress}>
                  <CardHeader className="pb-2">
                    <CardTitle>{pool.name}</CardTitle>
                    <CardDescription>{pool.dayRange} days per cycle</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Contribution</span>
                        <span className="font-medium">{ethers.formatEther(pool.contributionAmount)} ETH</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Participants</span>
                        <span className="font-medium">
                          {pool.currentParticipants}/{pool.expectedNumber}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Host Fee</span>
                        <span className="font-medium">{pool.hostFeePercentage / 100}%</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full" asChild>
                      <Link href={`/pools/${pool.contractAddress}`}>View Dashboard</Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border rounded-lg bg-muted/50">
              <p className="text-lg mb-2">No Contriboost pools found</p>
              <p className="text-muted-foreground mb-4">You haven't created or joined any Contriboost pools yet</p>
              <Button asChild>
                <Link href="/pools">Browse Pools</Link>
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="funds">
          {userFunds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userFunds.map((fund) => (
                <Card key={fund.contractAddress}>
                  <CardHeader className="pb-2">
                    <CardTitle>{fund.name}</CardTitle>
                    <CardDescription>Deadline: {formatDate(fund.deadline)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Target</span>
                        <span className="font-medium">{ethers.formatEther(fund.targetAmount)} ETH</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Current</span>
                        <span className="font-medium">{ethers.formatEther(fund.currentAmount)} ETH</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium">{fund.fundType === 0 ? "Group" : "Personal"}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5 mt-2">
                        <div
                          className="bg-primary h-2.5 rounded-full"
                          style={{
                            width: `${Math.min((Number(fund.currentAmount) / Number(fund.targetAmount)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full" asChild>
                      <Link href={`/funds/${fund.contractAddress}`}>View Fund</Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border rounded-lg bg-muted/50">
              <p className="text-lg mb-2">No GoalFunds found</p>
              <p className="text-muted-foreground mb-4">You haven't created or contributed to any GoalFunds yet</p>
              <Button asChild>
                <Link href="/create/goalfund">Create GoalFund</Link>
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}