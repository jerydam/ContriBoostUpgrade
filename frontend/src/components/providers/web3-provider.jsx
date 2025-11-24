"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { sdk } from "@farcaster/miniapp-sdk";
import { useMiniApp } from "./miniapp-provider"; // Assuming relative path; adjust as needed

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
  const [hasAutoConnected, setHasAutoConnected] = useState(false); // Flag to prevent race conditions
  const { isMiniApp: isMiniAppFromContext } = useMiniApp(); // Use context for consistency

  // Constants
  const CELO_MAINNET_ID = 42220;

  const CELO_MAINNET_CONFIG = {
    chainName: "Celo Mainnet",
    nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
    rpcUrls: ["https://forno.celo.org"],
    blockExplorerUrls: ["https://celoscan.io"],
  };

  const connect = useCallback(async () => {
    if (isConnecting) return; // Prevent multiple connects
    setIsConnecting(true);

    try {
      // 1. DETERMINE THE PROVIDER
      // In Farcaster, window.ethereum might be undefined, so we use the SDK getter
      let ethProvider = typeof window !== "undefined" ? window.ethereum : null;

      const isMiniApp = isMiniAppFromContext || await sdk.isInMiniApp();
      console.log('Is in Mini App?', isMiniApp); // Debug log
      
      if (isMiniApp) {
        // Explicitly get the provider from Farcaster SDK
        // This is the most reliable way in Mini Apps
        const sdkProvider = sdk.wallet.getEthereumProvider();
        console.log('SDK Provider:', sdkProvider ? 'Available' : 'NULL/Undefined'); // Debug log
        if (sdkProvider) {
            ethProvider = sdkProvider;
            console.log("Using Farcaster SDK Provider");
        }
      }

      if (!ethProvider) {
        console.error('No Ethereum provider available'); // Debug log
        if (!isMiniApp) {
           alert("Please install a Web3 Wallet to use this app");
        }
        setIsConnecting(false);
        return;
      }

      // 2. INITIALIZE ETHERS WITH THE FOUND PROVIDER
      // vital: pass ethProvider here, not window.ethereum
      const browserProvider = new ethers.BrowserProvider(ethProvider); 
      
      // Add delay for provider readiness in hosted environments
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);
      console.log('Current chain ID:', currentChainId); // Debug log

      // 3. NETWORK SWITCHING LOGIC (Temporarily optional for testing)
      let switched = false;
      if (currentChainId !== CELO_MAINNET_ID) {
        try {
          console.log('Attempting chain switch to Celo...'); // Debug log
          await ethProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${CELO_MAINNET_ID.toString(16)}` }],
          });
          switched = true;
          console.log('Chain switch successful'); // Debug log
        } catch (switchError) {
          console.error('Switch error details:', switchError.code, switchError.message); // Debug log
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
                console.log('Chain added successfully'); // Debug log
                switched = true;
            } catch (addError) {
                console.error("Failed to add chain:", addError);
                // If the wallet (like Warpcast internal) refuses to add Celo, we must stop here
                // For now, allow connection on current chain for testing; alert user
                if (isMiniApp) {
                  alert("Celo not supported automatically. Please add/switch to Celo manually in Warpcast Wallet settings.");
                }
                // Continue with current chain for demo/testing
                console.log('Continuing on current chain for now'); // Debug log
            }
          } else if (switchError.code === 4001) {
            // User rejected - common in wallets
            console.log('User rejected chain switch'); // Debug log
            alert("Please approve the chain switch in your wallet.");
            return;
          } else {
            console.error("Failed to switch chain:", switchError);
            throw switchError;
          }
        }
      }
      
      // Verify chain after switch/add
      const updatedNetwork = await browserProvider.getNetwork();
      const finalChainId = Number(updatedNetwork.chainId);
      setChainId(finalChainId);
      console.log('Final chain ID:', finalChainId); // Debug log

      // 4. REQUEST ACCOUNTS
      const accounts = await ethProvider.request({ method: "eth_requestAccounts" });
      console.log('Accounts requested:', accounts); // Debug log
      
      // Re-initialize provider/signer after network switch to be safe
      const updatedProvider = new ethers.BrowserProvider(ethProvider); 
      const userSigner = await updatedProvider.getSigner();

      setProvider(updatedProvider);
      setSigner(userSigner);
      setAccount(accounts[0]);
    } catch (error) {
      console.error("Error connecting to wallet:", error);
      // Optional: Alert in non-miniapp mode
      if (!isMiniAppFromContext) {
        alert("Connection failed. Please check console for details.");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [isMiniAppFromContext]);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
  }, []);

  // --- Farcaster Auto-Connect ---
  useEffect(() => {
    const handleFarcasterAutoConnect = async () => {
      if (hasAutoConnected || account || isConnecting) return; // Prevent races
      try {
        const isMiniApp = isMiniAppFromContext || await sdk.isInMiniApp();
        if (isMiniApp) {
            console.log("Farcaster context: Auto-connecting...");
            await connect();
            setHasAutoConnected(true);
        }
      } catch (err) {
        console.error("Farcaster auto-connect error:", err);
      }
    };
    handleFarcasterAutoConnect();
  }, [connect, account, isConnecting, hasAutoConnected, isMiniAppFromContext]);

  // --- Standard Web Persistence ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkConnection = async () => {
      const isMiniApp = isMiniAppFromContext || await sdk.isInMiniApp();
      if (isMiniApp) return; // Skip standard persistence in Mini App to avoid conflicts

      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts.length > 0) {
          await connect();
        }
      }
    };
    checkConnection();
  }, [connect, isMiniAppFromContext]);

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