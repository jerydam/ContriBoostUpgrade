import { useState, useEffect } from 'react';
import { useToast } from '@chakra-ui/react';
import { useAccount, useSigner } from 'wagmi';
import { Biconomy } from '@biconomy/mexa';
import { ethers } from 'ethers';
import ContriboostABI from '../lib/Contriboost.abi.json';
import styles from '../styles/Chat.module.css';

export default function Chat({ contractAddress, walletAddress }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [ws, setWs] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [hasJoined, setHasJoined] = useState(false);
  const { data: signer } = useSigner();
  const toast = useToast();
  const [biconomy, setBiconomy] = useState(null);

  // Initialize Biconomy
  useEffect(() => {
    const initializeBiconomy = async () => {
      if (signer) {
        const biconomyInstance = new Biconomy(signer.provider, {
          apiKey: process.env.NEXT_PUBLIC_BICONOMY_API_KEY,
          contractAddresses: [contractAddress],
        });
        await biconomyInstance.init();
        setBiconomy(biconomyInstance);
      }
    };
    initializeBiconomy();
  }, [signer, contractAddress]);

  // Check participant status
  useEffect(() => {
    const checkParticipantStatus = async () => {
      if (biconomy && walletAddress) {
        try {
          const contract = new ethers.Contract(contractAddress, ContriboostABI, biconomy.getSignerByAddress(walletAddress));
          const status = await contract.getParticipantStatus(walletAddress);
          setHasJoined(status[3]); // exists field
        } catch (error) {
          console.error('Error checking participant status:', error);
          toast({
            title: 'Error',
            description: 'Failed to check participant status.',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      }
    };
    checkParticipantStatus();
  }, [biconomy, walletAddress, contractAddress, toast]);

  // Initialize chat
  useEffect(() => {
    const initializeChat = async () => {
      if (!hasJoined) return;
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/chat/history/${contractAddress}`, {
          headers: { 'X-Wallet-Address': walletAddress },
        });
        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();
        setMessages(data.messages || []);

        const socket = new WebSocket(`wss://${process.env.NEXT_PUBLIC_BACKEND_URL.replace('https://', '')}/ws/chat/${contractAddress}`, [], {
          headers: { 'X-Wallet-Address': walletAddress },
        });

        socket.onopen = () => console.log('Connected to chat');
        socket.onmessage = (e) => {
          const message = JSON.parse(e.data);
          if (message.action === 'send') {
            setMessages((prev) => [...prev, message]);
          } else if (message.action === 'edit') {
            setMessages((prev) =>
              prev.map((m) => (m.id === message.id ? { ...m, content: message.content, edited: message.edited } : m))
            );
          } else if (message.action === 'delete') {
            setMessages((prev) => prev.filter((m) => m.id !== message.id));
          }
        };
        socket.onerror = (e) => {
          console.error('WebSocket error:', e);
          toast({
            title: 'Connection Error',
            description: 'Failed to connect to chat.',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        };
        socket.onclose = () => console.log('WebSocket closed');

        setWs(socket);
        return () => socket.close();
      } catch (error) {
        console.error('Error initializing chat:', error);
        toast({
          title: 'Error',
          description: 'Failed to initialize chat.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    };
    if (walletAddress && hasJoined) initializeChat();
  }, [contractAddress, walletAddress, hasJoined, toast]);

  const sendMessage = () => {
    if (input && ws) {
      ws.send(JSON.stringify({ action: 'send', content: input }));
      setInput('');
    }
  };

  const editMessage = (message) => {
    setEditingMessage(message);
    setInput(message.content);
  };

  const saveEdit = () => {
    if (editingMessage && input && ws) {
      ws.send(JSON.stringify({ action: 'edit', message_id: editingMessage.id, content: input }));
      setEditingMessage(null);
      setInput('');
    }
  };

  const deleteMessage = (messageId) => {
    if (ws) {
      ws.send(JSON.stringify({ action: 'delete', message_id: messageId }));
    }
  };

  // Optional: Gasless join transaction
  const joinContriboost = async () => {
    if (biconomy && signer) {
      try {
        const contract = new ethers.Contract(contractAddress, ContriboostABI, biconomy.getSignerByAddress(walletAddress));
        const { data } = await contract.populateTransaction.join();
        const tx = await biconomy.sendTransaction({ to: contractAddress, data });
        await tx.wait();
        setHasJoined(true);
        toast({
          title: 'Success',
          description: 'Joined Contriboost!',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } catch (error) {
        console.error('Error joining Contriboost:', error);
        toast({
          title: 'Error',
          description: 'Failed to join Contriboost.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    }
  };

  return (
    <div className={styles.container}>
      {!hasJoined ? (
        <div className={styles.notJoined}>
          <p>You must join the Contriboost to chat.</p>
          <button onClick={joinContriboost} className={styles.sendButton}>Join Contriboost (Gasless)</button>
        </div>
      ) : (
        <>
          <div className={styles.messageList}>
            {messages.map((message) => {
              const isSender = message.sender.toLowerCase() === walletAddress?.toLowerCase();
              const canEdit = isSender && message.timestamp > Date.now() / 1000 - 300;
              return (
                <div key={message.id} className={styles.messageContainer}>
                  <div className={styles.message}>
                    <span>{`${message.sender.slice(0, 6)}...${message.sender.slice(-4)}: ${message.content}`}</span>
                    {message.edited && <span className={styles.edited}>(edited)</span>}
                  </div>
                  {isSender && (
                    <div className={styles.buttonContainer}>
                      {canEdit && (
                        <button onClick={() => editMessage(message)} className={styles.button}>
                          Edit
                        </button>
                      )}
                      <button onClick={() => deleteMessage(message.id)} className={styles.button}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles.inputContainer}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message"
              className={styles.input}
              disabled={!hasJoined}
            />
            <button onClick={editingMessage ? saveEdit : sendMessage} className={styles.sendButton} disabled={!hasJoined}>
              {editingMessage ? 'Save' : 'Send'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}