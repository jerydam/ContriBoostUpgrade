"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ethers } from "ethers"
import { useWeb3 } from "@/components/providers/web3-provider"
import { ContriboostAbi } from "@/lib/contractabi"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, User, Calendar, DollarSign } from "lucide-react"
import { Progress } from "@/components/ui/progress"

export default function PoolDashboardPage() {
  const { address } = useParams()
  const { provider, signer, account } = useWeb3()
  const [poolDetails, setPoolDetails] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDepositing, setIsDepositing] = useState(false)
  const [isDistributing, setIsDistributing] = useState(false)

  useEffect(() => {
    if (provider && address) {
      fetchPoolDetails()
    }
  }, [provider, address, account])

  async function fetchPoolDetails() {
    if (!provider) return

    setIsLoading(true)
    try {
      const contract = new ethers.Contract(address, ContriboostAbi, provider)

      // Fetch basic pool information
      const [
        name,
        description,
        dayRange,
        expectedNumber,
        contributionAmount,
        hostFeePercentage,
        currentSegment,
        startTimestamp,
        host,
      ] = await Promise.all([
        contract.name(),
        contract.description(),
        contract.dayRange(),
        contract.expectedNumber(),
        contract.contributionAmount(),
        contract.hostFeePercentage(),
        contract.currentSegment(),
        contract.startTimestamp(),
        contract.host(),
      ])

      // Fetch all participants
      const participantAddresses = await contract.getActiveParticipants()

      // Fetch details for each participant
      const participants = await Promise.all(
        participantAddresses.map(async (participantAddress) => {
          const [id, depositAmount, lastDepositTime, exists, receivedFunds, active, missedDeposits] =
            await contract.getParticipantStatus(participantAddress)

          return {
            address: participantAddress,
            id: Number(id),
            depositAmount,
            lastDepositTime: Number(lastDepositTime),
            exists,
            receivedFunds,
            active,
            missedDeposits: Number(missedDeposits),
          }
        }),
      )

      // Fetch recent events (simplified for this example)
      // In a real implementation, you would use ethers.js filters to get events
      const events = [] // Placeholder for actual event fetching

      setPoolDetails({
        name,
        description,
        dayRange: Number(dayRange),
        expectedNumber: Number(expectedNumber),
        contributionAmount,
        hostFeePercentage: Number(hostFeePercentage),
        currentSegment: Number(currentSegment),
        startTimestamp: Number(startTimestamp),
        host,
        participants,
        events,
      })
    } catch (error) {
      console.error("Error fetching pool details:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function depositFunds() {
    if (!signer || !poolDetails) return

    setIsDepositing(true)
    try {
      const contract = new ethers.Contract(address, ContriboostAbi, signer)

      // Call the deposit function with the contribution amount
      const tx = await contract.deposit({
        value: poolDetails.contributionAmount,
      })

      await tx.wait()

      // Refresh pool details
      await fetchPoolDetails()

      alert("Deposit successful!")
    } catch (error) {
      console.error("Error depositing funds:", error)
      alert(`Error depositing funds: ${error.message || "Unknown error"}`)
    } finally {
      setIsDepositing(false)
    }
  }

  async function distributeFunds() {
    if (!signer || !poolDetails) return

    setIsDistributing(true)
    try {
      const contract = new ethers.Contract(address, ContriboostAbi, signer)

      // Only the host can distribute funds
      const tx = await contract.distributeFunds()
      await tx.wait()

      // Refresh pool details
      await fetchPoolDetails()

      alert("Funds distributed successfully!")
    } catch (error) {
      console.error("Error distributing funds:", error)
      alert(`Error distributing funds: ${error.message || "Unknown error"}`)
    } finally {
      setIsDistributing(false)
    }
  }

  function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString()
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>Loading pool details...</span>
      </div>
    )
  }

  if (!poolDetails) {
    return (
      <div className="container mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-4">Pool Not Found</h1>
        <p>The requested Contriboost pool could not be found or there was an error loading it.</p>
        <Button className="mt-4" asChild>
          <a href="/pools">Back to Pools</a>
        </Button>
      </div>
    )
  }

  const isHost = account && account.toLowerCase() === poolDetails.host.toLowerCase()
  const currentParticipant = poolDetails.participants.find(
    (p) => account && p.address.toLowerCase() === account.toLowerCase(),
  )

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{poolDetails.name}</h1>
        <p className="text-muted-foreground">{poolDetails.description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Participants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <User className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {poolDetails.participants.length}/{poolDetails.expectedNumber}
              </span>
            </div>
            <Progress
              value={(poolDetails.participants.length / poolDetails.expectedNumber) * 100}
              className="h-2 mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Cycle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-2xl font-bold">{poolDetails.currentSegment}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Started on {formatDate(poolDetails.startTimestamp)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contribution Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-2xl font-bold">{ethers.formatEther(poolDetails.contributionAmount)} ETH</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Host fee: {poolDetails.hostFeePercentage / 100}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="participants">
        <TabsList className="mb-6">
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="participants">
          <div className="space-y-6">
            {account && (
              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                  <CardDescription>
                    {isHost
                      ? "Manage your Contriboost pool"
                      : currentParticipant
                        ? "Participate in the pool"
                        : "Join this pool to participate"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  {currentParticipant && (
                    <Button onClick={depositFunds} disabled={isDepositing}>
                      {isDepositing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Deposit Funds
                    </Button>
                  )}

                  {isHost && (
                    <>
                      <Button onClick={distributeFunds} disabled={isDistributing} variant="secondary">
                        {isDistributing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Distribute Funds
                      </Button>
                      <Button variant="outline">Update Description</Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Participants</CardTitle>
                <CardDescription>Current members of this Contriboost pool</CardDescription>
              </CardHeader>
              <CardContent>
                {poolDetails.participants.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Address</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Deposit Amount</TableHead>
                        <TableHead>Last Deposit</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poolDetails.participants.map((participant) => (
                        <TableRow key={participant.address}>
                          <TableCell className="font-medium">
                            {formatAddress(participant.address)}
                            {account && participant.address.toLowerCase() === account.toLowerCase() && (
                              <span className="ml-2 text-xs bg-primary/10 text-primary py-0.5 px-1.5 rounded-full">
                                You
                              </span>
                            )}
                            {participant.address.toLowerCase() === poolDetails.host.toLowerCase() && (
                              <span className="ml-2 text-xs bg-orange-100 text-orange-800 py-0.5 px-1.5 rounded-full">
                                Host
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{participant.id}</TableCell>
                          <TableCell>{ethers.formatEther(participant.depositAmount)} ETH</TableCell>
                          <TableCell>
                            {participant.lastDepositTime > 0
                              ? formatDate(participant.lastDepositTime)
                              : "No deposits yet"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`text-xs font-medium py-1 px-2 rounded-full ${
                                participant.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {participant.active ? "Active" : "Inactive"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No participants have joined this pool yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Event History</CardTitle>
              <CardDescription>Recent activity in this Contriboost pool</CardDescription>
            </CardHeader>
            <CardContent>
              {poolDetails.events.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poolDetails.events.map((event, index) => (
                      <TableRow key={index}>
                        <TableCell>{event.name}</TableCell>
                        <TableCell>{event.details}</TableCell>
                        <TableCell>{event.date}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No events have been recorded yet.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
