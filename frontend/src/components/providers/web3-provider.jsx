"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";

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

  // Supported chain IDs
  const SUPPORTED_CHAINS = {
    42220: {
      chainName: "Celo Mainnet",
      nativeCurrency: { name: "Celo Mainnet", symbol: "Celo", decimals: 18 },
      rpcUrls: ["https://forno.celo.org"],
      blockExplorerUrls: ["https://celoscan.io"],
    },
    44787: {
      chainName: "Celo Alfajores Testnet",
      nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
      rpcUrls: ["https://alfajores-forno.celo-testnet.org"],
      blockExplorerUrls: ["https://alfajores-blockscout.celo-testnet.org"],
    },
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkConnection = async () => {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts.length > 0) {
          await connect();
        }
      }
    };

    checkConnection();
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (account !== accounts[0]) {
        await connect();
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [account]);

  const connect = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask to use this app");
      return;
    }

    setIsConnecting(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      // Check if the current chain is supported
      if (!SUPPORTED_CHAINS[currentChainId]) {
        // Default to Celo Mainnet if unsupported chain
        const defaultChainId = 42220;
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${defaultChainId.toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${defaultChainId.toString(16)}`,
                  ...SUPPORTED_CHAINS[defaultChainId],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
        const updatedNetwork = await browserProvider.getNetwork();
        setChainId(Number(updatedNetwork.chainId));
      } else {
        setChainId(currentChainId);
      }

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const userSigner = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(userSigner);
      setAccount(accounts[0]);
    } catch (error) {
      console.error("Error connecting to wallet:", error);
      alert(`Failed to connect wallet: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
  };

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