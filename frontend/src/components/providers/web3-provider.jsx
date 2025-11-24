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
    setIsConnecting(true);

    try {
      // 1. DETERMINE THE PROVIDER
      // In Farcaster, window.ethereum might be undefined, so we use the SDK getter
      let ethProvider = typeof window !== "undefined" ? window.ethereum : null;

      const isMiniApp = await sdk.isInMiniApp();
      
      if (isMiniApp) {
        // Explicitly get the provider from Farcaster SDK
        // This is the most reliable way in Mini Apps
        const sdkProvider = sdk.wallet.getEthereumProvider();
        if (sdkProvider) {
            ethProvider = sdkProvider;
            console.log("Using Farcaster SDK Provider");
        }
      }

      if (!ethProvider) {
        if (!isMiniApp) {
           alert("Please install a Web3 Wallet to use this app");
        }
        setIsConnecting(false);
        return;
      }

      // 2. INITIALIZE ETHERS WITH THE FOUND PROVIDER
      // vital: pass ethProvider here, not window.ethereum
      const browserProvider = new ethers.BrowserProvider(ethProvider); 
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      // 3. NETWORK SWITCHING LOGIC
      if (currentChainId !== CELO_MAINNET_ID) {
        try {
          await ethProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${CELO_MAINNET_ID.toString(16)}` }],
          });
        } catch (switchError) {
          // This error code indicates that the chain has not been added to the wallet
          if (switchError.code === 4902) {
            try {
                await ethProvider.request({
                method: "wallet_addEthereumChain",
                params: [
                    {
                    chainId: `0x${CELO_MAINNET_ID.toString(16)}`,
                    ...CELO_MAINNET_CONFIG,
                    },
                ],
                });
            } catch (addError) {
                console.error("Failed to add chain:", addError);
                // If the wallet (like Warpcast internal) refuses to add Celo, we must stop here
                alert("This wallet does not support adding Celo Mainnet automatically. Please switch manually.");
                throw addError;
            }
          } else {
            console.error("Failed to switch chain:", switchError);
            throw switchError;
          }
        }
      }
      
      setChainId(CELO_MAINNET_ID);

      // 4. REQUEST ACCOUNTS
      const accounts = await ethProvider.request({ method: "eth_requestAccounts" });
      
      // Re-initialize provider/signer after network switch to be safe
      const updatedProvider = new ethers.BrowserProvider(ethProvider); 
      const userSigner = await updatedProvider.getSigner();

      setProvider(updatedProvider);
      setSigner(userSigner);
      setAccount(accounts[0]);
    } catch (error) {
      console.error("Error connecting to wallet:", error);
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
        if (isMiniApp && !account) {
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
      const isMiniApp = await sdk.isInMiniApp();
      if (isMiniApp) return; // Skip standard persistence in Mini App to avoid conflicts

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
    // Only set listeners if window.ethereum is available 
    // (Farcaster SDK provider doesn't always support .on directly the same way)
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (account !== accounts[0]) {
        await connect();
      }
    };

    const handleChainChanged = (chainIdHex) => {
      const newChainId = parseInt(chainIdHex, 16);
      if (newChainId !== CELO_MAINNET_ID) {
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