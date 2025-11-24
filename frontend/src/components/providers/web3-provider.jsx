"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { sdk } from "@farcaster/miniapp-sdk";

const Web3Context = createContext({
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  connect: async () => {},
  disconnect: () => {},
  isConnecting: false,
});

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Constants
  const CELO_MAINNET_ID = 42220;

  const CELO_MAINNET_CONFIG = {
    chainName: "Celo Mainnet",
    nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
    rpcUrls: ["https://forno.celo.org"],
    blockExplorerUrls: ["https://celoscan.io"],
  };

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      // Don't alert if we are in a MiniApp loading state
      const isMiniApp = await sdk.isInMiniApp();
      if (!isMiniApp) {
        alert("Please install MetaMask (or a web3 wallet) to use this app");
      }
      return;
    }

    setIsConnecting(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      // --- Network Switching Logic ---
      // STRICT CHECK: If not on Celo Mainnet, force switch
      if (currentChainId !== CELO_MAINNET_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${CELO_MAINNET_ID.toString(16)}` }],
          });
        } catch (switchError) {
          // Error 4902 means the chain hasn't been added to the wallet yet
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${CELO_MAINNET_ID.toString(16)}`,
                  ...CELO_MAINNET_CONFIG,
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
        
        // Refresh network info after switch
        // Note: browserProvider.getNetwork() might cache, so we might need to rely on the event listener, 
        // but getting the signer usually triggers a refresh internally in ethers v6
      }
      
      // Update state with the correct chain ID
      setChainId(CELO_MAINNET_ID);

      // Request accounts
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const userSigner = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(userSigner);
      setAccount(accounts[0]);
    } catch (error) {
      console.error("Error connecting to wallet:", error);
      // Ignore user rejection error (4001) to prevent annoying alerts
      if (error.code !== 4001) {
        alert(`Failed to connect wallet: ${error.message}`);
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
  }, []);

  // --- Farcaster Auto-Connect ---
  useEffect(() => {
    const handleFarcasterAutoConnect = async () => {
      try {
        const isMiniApp = await sdk.isInMiniApp();
        // If inside Farcaster and not connected, connect immediately
        // This will trigger the Network Switch logic above if they are on Base/Optimism default
        if (isMiniApp && window.ethereum && !account) {
            console.log("Farcaster context: Auto-connecting...");
            await connect();
        }
      } catch (err) {
        console.error("Farcaster auto-connect error:", err);
      }
    };
    handleFarcasterAutoConnect();
  }, [connect, account]);

  // --- Standard Web Persistence ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkConnection = async () => {
      // Skip if in MiniApp (handled above)
      const isMiniApp = await sdk.isInMiniApp();
      if (isMiniApp) return;

      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts.length > 0) {
          await connect();
        }
      }
    };

    checkConnection();
  }, [connect]);

  // --- Listeners ---
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (account !== accounts[0]) {
        await connect();
      }
    };

    const handleChainChanged = (chainIdHex) => {
      // Ethers/Metamask returns chainId in hex via this event
      const newChainId = parseInt(chainIdHex, 16);
      if (newChainId !== CELO_MAINNET_ID) {
        // Optionally reload or force disconnect if they switch network manually
        window.location.reload(); 
      } else {
        setChainId(newChainId);
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [account, connect, disconnect]);

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        account,
        chainId,
        connect,
        disconnect,
        isConnecting,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  return useContext(Web3Context);
}