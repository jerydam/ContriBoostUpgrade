"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";
import { inAppWallet, preAuthenticate, authenticate, createWallet } from "thirdweb/wallets";
import { createThirdwebClient, defineChain } from "thirdweb";

// Thirdweb client
const thirdwebClient = createThirdwebClient({ clientId: "b81c12c8d9ae57479a26c52be1d198eb" });

// Define custom chains
const liskSepolia = defineChain({
  id: 4202,
  name: "Lisk Sepolia Testnet",
  nativeCurrency: { name: "Lisk Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpc: ["https://rpc.sepolia-api.lisk.com"],
  blockExplorers: [{ name: "Lisk Explorer", url: "https://sepolia-blockscout.lisk.com" }],
});

const celoAlfajores = defineChain({
  id: 44787,
  name: "Celo Alfajores Testnet",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpc: ["https://alfajores-forno.celo-testnet.org"],
  blockExplorers: [{ name: "Celo Explorer", url: "https://alfajores-blockscout.celo-testnet.org" }],
});

// Custom storage
const myStorage = {
  getItem: async (key) => localStorage.getItem(`CUSTOM_STORAGE_KEY${key}`),
  setItem: async (key, value) => localStorage.setItem(`CUSTOM_STORAGE_KEY${key}`, value),
  removeItem: async (key) => localStorage.removeItem(`CUSTOM_STORAGE_KEY${key}`),
};

const Web3Context = createContext({
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  walletType: null,
  connect: async () => {},
  connectInAppWallet: async () => {},
  disconnect: () => {},
  isConnecting: false,
});

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [walletType, setWalletType] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const SUPPORTED_CHAINS = {
    4202: {
      chainName: "Lisk Sepolia Testnet",
      nativeCurrency: { name: "Lisk Sepolia ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.sepolia-api.lisk.com"],
      blockExplorerUrls: ["https://sepolia-blockscout.lisk.com"],
    },
    44787: {
      chainName: "Celo Alfajores Testnet",
      nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
      rpcUrls: ["https://alfajores-forno.celo-testnet.org"],
      blockExplorerUrls: ["https://alfajores-blockscout.celo-testnet.org"],
    },
  };

  // Retry logic for network requests
  async function withRetry(fn, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries || !error.message.includes("Failed to fetch")) {
          throw error;
        }
        console.warn(`Retry ${attempt}/${maxRetries} failed: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Initialize inAppWallet
  const wallet = inAppWallet({
    smartAccount: {
      chain: liskSepolia,
      sponsorGas: true,
    },
    auth: {
      mode: "popup", // Changed to popup to avoid redirect issues
      options: ["google", "email", "phone", "passkey", "guest", "wallet"],
      defaultSmsCountryCode: "+1",
      passkeyDomain: typeof window !== "undefined" ? window.location.hostname : "localhost",
    },
    hidePrivateKeyExport: true,
    metadata: {
      image: {
        src: "https://example.com/logo.png",
        alt: "Contriboost Logo",
        width: 100,
        height: 100,
      },
    },
    storage: myStorage,
  });

  // Login with Socials (e.g., Google)
  async function connectWithSocials(strategy) {
    try {
      const thirdwebChain = chainId === 44787 ? celoAlfajores : liskSepolia;
      const walletAccount = await withRetry(() =>
        wallet.connect({
          client: thirdwebClient,
          chain: thirdwebChain,
          strategy,
        })
      );
      const rpcUrl = thirdwebChain.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(Number(thirdwebChain.id));
      setWalletType("smart");
    } catch (error) {
      console.error(`Error connecting with ${strategy}:`, error.message, error.stack);
      throw error;
    }
  }
  // Example:
  // await connectWithSocials("google");

  // Login with Email
  async function connectWithEmail(email, verificationCode = null) {
    try {
      const thirdwebChain = chainId === 44787 ? celoAlfajores : liskSepolia;
      if (!verificationCode) {
        await withRetry(() =>
          preAuthenticate({
            client: thirdwebClient,
            strategy: "email",
            email,
          })
        );
        return { preAuth: true, type: "email" };
      }
      const walletAccount = await wallet.connect({
        client: thirdwebClient,
        chain: thirdwebChain,
        strategy: "email",
        email,
        verificationCode,
      });
      const rpcUrl = thirdwebChain.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(Number(thirdwebChain.id));
      setWalletType("smart");
    } catch (error) {
      console.error("Error connecting with email:", error.message, error.stack);
      throw error;
    }
  }
  // Example:
  // await connectWithEmail("example@example.com"); // Sends verification code
  // await connectWithEmail("example@example.com", "123456"); // Logs in with code

  // Login with Phone Number
  async function connectWithPhone(phoneNumber, verificationCode = null) {
    try {
      const thirdwebChain = chainId === 44787 ? celoAlfajores : liskSepolia;
      if (!verificationCode) {
        await withRetry(() =>
          preAuthenticate({
            client: thirdwebClient,
            strategy: "phone",
            phoneNumber,
          })
        );
        return { preAuth: true, type: "phone" };
      }
      const walletAccount = await wallet.connect({
        client: thirdwebClient,
        chain: thirdwebChain,
        strategy: "phone",
        phoneNumber,
        verificationCode,
      });
      const rpcUrl = thirdwebChain.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(Number(thirdwebChain.id));
      setWalletType("smart");
    } catch (error) {
      console.error("Error connecting with phone:", error.message, error.stack);
      throw error;
    }
  }
  // Example:
  // await connectWithPhone("+1234567890"); // Sends verification code
  // await connectWithPhone("+1234567890", "123456"); // Logs in with code

  // Login with Passkey
  async function connectWithPasskey() {
    try {
      const thirdwebChain = chainId === 44787 ? celoAlfajores : liskSepolia;
      let walletAccount;
      try {
        walletAccount = await withRetry(() =>
          authenticate({
            client: thirdwebClient,
            strategy: "passkey",
            type: "sign-up",
          })
        );
      } catch (error) {
        console.error("Passkey sign-up failed, trying sign-in:", error);
        walletAccount = await authenticate({
          client: thirdwebClient,
          strategy: "passkey",
          type: "sign-in",
        });
      }
      const rpcUrl = thirdwebChain.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(Number(thirdwebChain.id));
      setWalletType("smart");
    } catch (error) {
      console.error("Error connecting with passkey:", error.message, error.stack);
      throw error;
    }
  }
  // Example:
  // await connectWithPasskey();

  // Connect to a Guest Account
  async function connectAsGuest() {
    try {
      const thirdwebChain = chainId === 44787 ? celoAlfajores : liskSepolia;
      const walletAccount = await wallet.connect({
        client: thirdwebClient,
        chain: thirdwebChain,
        strategy: "guest",
      });
      const rpcUrl = thirdwebChain.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(Number(thirdwebChain.id));
      setWalletType("smart");
    } catch (error) {
      console.error("Error connecting as guest:", error.message, error.stack);
      throw error;
    }
  }
  // Example:
  // await connectAsGuest();

  // Login with SIWE (e.g., Rabby)
  async function connectWithSIWE() {
    try {
      const thirdwebChain = chainId === 44787 ? celoAlfajores : liskSepolia;
      const rabby = createWallet("io.rabby");
      const walletAccount = await wallet.connect({
        client: thirdwebClient,
        chain: thirdwebChain,
        strategy: "wallet",
        wallet: rabby,
      });
      const rpcUrl = thirdwebChain.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(Number(thirdwebChain.id));
      setWalletType("smart");
    } catch (error) {
      console.error("Error connecting with SIWE:", error.message, error.stack);
      throw error;
    }
  }
  // Example:
  // await connectWithSIWE();

  // Unified connectInAppWallet function
  async function connectInAppWallet(strategy, options = {}) {
    setIsConnecting(true);
    try {
      switch (strategy) {
        case "google":
          await connectWithSocials("google");
          break;
        case "email":
          return await connectWithEmail(options.email, options.verificationCode);
        case "phone":
          return await connectWithPhone(options.phoneNumber, options.verificationCode);
        case "passkey":
          await connectWithPasskey();
          break;
        case "guest":
          await connectAsGuest();
          break;
        case "wallet":
          await connectWithSIWE();
          break;
        default:
          throw new Error(`Unsupported strategy: ${strategy}`);
      }
    } catch (error) {
      console.error(`Error in connectInAppWallet (${strategy}):`, error.message, error.stack);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }

  // MetaMask connect function
  async function connect() {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("Please install MetaMask to use this app");
    }

    setIsConnecting(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      if (!SUPPORTED_CHAINS[currentChainId]) {
        const defaultChainId = 4202;
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
      setWalletType("eoa");
    } catch (error) {
      console.error("Error connecting to wallet:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }

  // Disconnect function
  function disconnect() {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
    setWalletType(null);
    wallet.disconnect();
  }

  // Effect hooks for MetaMask connection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            await connect();
          }
        } catch (error) {
          console.error("Error checking MetaMask connection:", error);
        }
      }
    };

    checkConnection();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

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

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        account,
        chainId,
        walletType,
        connect,
        connectInAppWallet,
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