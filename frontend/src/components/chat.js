"use client";

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '@/components/providers/web3-provider';
import { ContriboostAbi } from '@/lib/contractabi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Edit2, Trash2, MessageCircle } from 'lucide-react';
import { toast } from 'react-toastify';

export default function Chat({ contractAddress, walletAddress }) {
  const { provider, signer } = useWeb3();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [ws, setWs] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [poolInfo, setPoolInfo] = useState(null);

  // Check participant status
  useEffect(() => {
    const checkParticipantStatus = async () => {
      if (provider && walletAddress && contractAddress) {
        try {
          const contract = new ethers.Contract(contractAddress, ContriboostAbi, provider);
          
          // Get pool info
          const [poolData, participantCount] = await Promise.all([
            contract.getPoolInfo(),
            contract.getParticipantCount()
          ]);
          
          setPoolInfo({
            ...poolData,
            participantCount: participantCount.toString()
          });

          // Check if user has joined
          try {
            const participantData = await contract.getParticipantStatus(walletAddress);
            setHasJoined(participantData[3]); // exists field
          } catch (error) {
            // If getParticipantStatus fails, user probably hasn't joined
            setHasJoined(false);
          }
        } catch (error) {
          console.error('Error checking participant status:', error);
          toast.error('Failed to check participant status');
        }
        setIsLoading(false);
      }
    };
    
    checkParticipantStatus();
  }, [provider, walletAddress, contractAddress]);

  // Initialize chat (simplified without WebSocket for now)
  useEffect(() => {
    if (hasJoined && contractAddress) {
      // For now, we'll use a simple message state
      // In a real implementation, you'd connect to your chat backend
      setMessages([
        {
          id: 1,
          sender: '0x1234...5678',
          content: 'Welcome to the Contriboost chat!',
          timestamp: Date.now() / 1000,
          edited: false
        }
      ]);
    }
  }, [hasJoined, contractAddress]);

  // Join the pool
  const joinContriboost = async () => {
    if (!signer || !contractAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    setIsJoining(true);
    try {
      const contract = new ethers.Contract(contractAddress, ContriboostAbi, signer);
      
      // Check if pool is still open for joining
      const poolData = await contract.getPoolInfo();
      const participantCount = await contract.getParticipantCount();
      
      if (participantCount >= poolData.maxParticipants) {
        toast.error('Pool is full');
        setIsJoining(false);
        return;
      }

      // Join the pool
      const tx = await contract.join();
      toast.info('Transaction submitted. Waiting for confirmation...');
      
      await tx.wait();
      setHasJoined(true);
      toast.success('Successfully joined the Contriboost!');
      
      // Refresh pool info
      const updatedCount = await contract.getParticipantCount();
      setPoolInfo(prev => ({
        ...prev,
        participantCount: updatedCount.toString()
      }));
      
    } catch (error) {
      console.error('Error joining Contriboost:', error);
      if (error.reason) {
        toast.error(`Failed to join: ${error.reason}`);
      } else {
        toast.error('Failed to join Contriboost');
      }
    }
    setIsJoining(false);
  };

  // Send message (simplified)
  const sendMessage = () => {
    if (input.trim() && hasJoined) {
      const newMessage = {
        id: Date.now(),
        sender: walletAddress,
        content: input.trim(),
        timestamp: Date.now() / 1000,
        edited: false
      };
      
      setMessages(prev => [...prev, newMessage]);
      setInput('');
      
      // In a real implementation, you'd send this to your backend
      console.log('Sending message:', newMessage);
    }
  };

  // Edit message (simplified)
  const editMessage = (message) => {
    setEditingMessage(message);
    setInput(message.content);
  };

  // Save edit (simplified)
  const saveEdit = () => {
    if (editingMessage && input.trim()) {
      setMessages(prev =>
        prev.map(m =>
          m.id === editingMessage.id
            ? { ...m, content: input.trim(), edited: true }
            : m
        )
      );
      setEditingMessage(null);
      setInput('');
    }
  };

  // Delete message (simplified)
  const deleteMessage = (messageId) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  // Format address
  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading chat...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Pool Info Header */}
      {poolInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Contriboost Chat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Participants:</span>
                <p className="font-medium">{poolInfo.participantCount} / {poolInfo.maxParticipants?.toString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Contribution:</span>
                <p className="font-medium">
                  {ethers.formatEther(poolInfo.contributionAmount || 0)} ETH
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={hasJoined ? "default" : "secondary"}>
                  {hasJoined ? "Joined" : "Not Joined"}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Contract:</span>
                <p className="font-mono text-xs">{formatAddress(contractAddress)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat Area */}
      <Card className="h-[600px] flex flex-col">
        <CardHeader>
          <CardTitle className="text-lg">Chat Messages</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          {!hasJoined ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="text-center">
                <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <h3 className="font-medium">Join to Chat</h3>
                <p className="text-sm text-muted-foreground">
                  You must join this Contriboost pool to participate in the chat.
                </p>
              </div>
              <Button 
                onClick={joinContriboost} 
                disabled={isJoining}
                size="lg"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Joining...
                  </>
                ) : (
                  'Join Contriboost'
                )}
              </Button>
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto space-y-3 mb-4 p-2 bg-muted/10 rounded-lg">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isSender = message.sender.toLowerCase() === walletAddress?.toLowerCase();
                    const canEdit = isSender && message.timestamp > Date.now() / 1000 - 300; // 5 min edit window
                    
                    return (
                      <div key={message.id} className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${
                          isSender 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-background border'
                        }`}>
                          <div className="flex items-center gap-2 text-xs opacity-75 mb-1">
                            <span>{formatAddress(message.sender)}</span>
                            <span>{formatTime(message.timestamp)}</span>
                            {message.edited && (
                              <Badge variant="outline" className="text-xs py-0">edited</Badge>
                            )}
                          </div>
                          <p className="text-sm">{message.content}</p>
                          
                          {isSender && (
                            <div className="flex gap-1 mt-2">
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => editMessage(message)}
                                  className="h-6 px-2 text-xs"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMessage(message.id)}
                                className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input Area */}
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={editingMessage ? "Edit your message..." : "Type a message..."}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      editingMessage ? saveEdit() : sendMessage();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={editingMessage ? saveEdit : sendMessage}
                  disabled={!input.trim()}
                  size="sm"
                >
                  {editingMessage ? (
                    'Save'
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                    </>
                  )}
                </Button>
                {editingMessage && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingMessage(null);
                      setInput('');
                    }}
                    size="sm"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}