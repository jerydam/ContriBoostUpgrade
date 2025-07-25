"use client";

import { useParams } from 'next/navigation';
import Chat from '../../../components/Chat';
import { useAccount } from 'wagmi';
import { useWeb3 } from '@/components/providers/web3-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ChatPage() {
  const params = useParams();
  const contractAddress = params?.contractaddress;
  const { address, isConnected } = useAccount();
  const { account, connect } = useWeb3();

  // Use the Web3Provider account if wagmi account is not available
  const walletAddress = address || account;
  const isWalletConnected = isConnected || !!account;

  if (!isWalletConnected) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Connect Wallet Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p>Please connect your wallet to access the chat.</p>
            <Button onClick={connect}>Connect Wallet</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!contractAddress) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Loading...</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Loading chat for contract...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <Chat contractAddress={contractAddress} walletAddress={walletAddress} />
    </div>
  );
}