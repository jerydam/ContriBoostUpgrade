import { useRouter } from 'next/router';
import Chat from '../../components/Chat';
import { useAccount } from 'wagmi';

export default function ChatPage() {
  const router = useRouter();
  const { contractAddress } = router.query;
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return <div>Please connect your wallet</div>;
  }

  if (!contractAddress) {
    return <div>Loading...</div>;
  }

  return <Chat contractAddress={contractAddress} walletAddress={address} />;
}