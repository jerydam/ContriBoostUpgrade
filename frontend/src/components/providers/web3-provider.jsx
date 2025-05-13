"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";
import { inAppWallet, preAuthenticate, authenticate, createWallet } from "thirdweb/wallets";
import { createThirdwebClient, defineChain } from "thirdweb";
import { debounce } from "lodash";
import { toast } from "react-toastify";
import { SUPPORTED_CHAINS } from "@/utils/config";

// Thirdweb client
const thirdwebClient = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_CLIENT_ID,
});

// Define custom chains
const liskSepolia = defineChain({
  id: 4202,
  name: "Lisk Sepolia Testnet",
  nativeCurrency: { name: "Lisk Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpc: ["https://rpc.sepolia-api.lisk.com"],
  blockExplorers: [{ name: "Lisk Explorer", url: "https://sepolia-blockscout.lisk.com" }],
  testnet: true,
});

// const celoAlfajores = defineChain({
//   id: 44787,
//   name: "Celo Alfajores Testnet",
//   nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
//   rpc: ["https://alfajores-forno.celo-testnet.org"],
//   blockExplorers: [{ name: "Celo Explorer", url: "https://alfajores-blockscout.celo-testnet.org" }],
//   testnet: true,
// });

// Custom storage with security warning
const myStorage = {
  getItem: async (key) => {
    console.warn("Using localStorage for wallet data. Ensure this is secure for your use case.");
    return localStorage.getItem(`CUSTOM_STORAGE_KEY${key}`);
  },
  setItem: async (key, value) => {
    console.warn("Using localStorage for wallet data. Ensure this is secure for your use case.");
    localStorage.setItem(`CUSTOM_STORAGE_KEY${key}`, value);
  },
  removeItem: async (key) => {
    localStorage.removeItem(`CUSTOM_STORAGE_KEY${key}`);
  },
};

const Web3Context = createContext({
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  walletType: null,
  balance: null,
  connect: async () => { throw new Error("connect not implemented"); },
  connectInAppWallet: async () => { throw new Error("connectInAppWallet not implemented"); },
  disconnect: () => { throw new Error("disconnect not implemented"); },
  isConnecting: false,
  isInitialized: false,
  switchNetwork: async () => { throw new Error("switchNetwork not implemented"); },
  thirdwebClient: null,
  liskSepolia: null,
  // celoAlfajores: null,
});
export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [walletType, setWalletType] = useState(null);
  const [balance, setBalance] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastBlockNumber, setLastBlockNumber] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const [connectionStrategy, setConnectionStrategy] = useState(null);
  const [wallet, setWallet] = useState(null);

  // Map chain IDs to Thirdweb chain configurations
  const chainConfigs = {
    4202: liskSepolia,
    // 44787: celoAlfajores,
  };

  // Map chain IDs to ethers provider RPC URLs
  const rpcUrls = {
    4202: "https://rpc.sepolia-api.lisk.com",
    // 44787: "https://alfajores-forno.celo-testnet.org",
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

  // Debounced balance fetching
  const debouncedFetchBalance = debounce(async (accountAddress, providerInstance, chainId) => {
    if (!accountAddress || !providerInstance) {
      setBalance(null);
      return;
    }
    try {
      const currentBlock = await providerInstance.getBlockNumber();
      if (currentBlock !== lastBlockNumber) {
        const balanceWei = await providerInstance.getBalance(accountAddress);
        const balanceEther = ethers.formatEther(balanceWei);
        const symbol = chainId === 44787 ? "CELO" : "ETH";
        setBalance(`${parseFloat(balanceEther).toFixed(4)} ${symbol}`);
        setLastBlockNumber(currentBlock);
      }
    } catch (error) {
      console.error("Error fetching balance:", error.message);
      setBalance("Error fetching balance");
    }
  }, 1000);

  // Initialize inAppWallet for Lisk Sepolia only
  useEffect(() => {
    const newWallet = inAppWallet({
      smartAccount: {
        chain: liskSepolia, // Always use Lisk Sepolia for Smart Wallet
        sponsorGas: true,
      },
      auth: {
        mode: "popup",
        options: ["google", "email", "phone", "passkey", "guest", "wallet"],
        defaultSmsCountryCode: "+1",
        passkeyDomain: typeof window !== "undefined" ? window.location.hostname : "localhost",
      },
      hidePrivateKeyExport: true,
      metadata: {
        image: {
          src: "favicon.png",
          alt: "Contriboost Logo",
          width: 100,
          height: 100,
        },
      },
      storage: myStorage,
    });
    setWallet(newWallet);
  }, []);

  // Login with Socials (e.g., Google)
  async function connectWithSocials(strategy) {
    if (!wallet) {
      throw new Error("Wallet not initialized. Please try again.");
    }
    try {
      const walletAccount = await withRetry(() =>
        wallet.connect({
          client: thirdwebClient,
          chain: liskSepolia, // Always Lisk Sepolia for Smart Wallet
          strategy,
        })
      );
      const rpcUrl = liskSepolia.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(4202); // Lisk Sepolia
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 4202);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Lisk Sepolia. Insufficient gas funds (requires ETH).`;
      }
      console.error(`Error connecting with ${strategy}:`, error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

  // Login with Email
  async function connectWithEmail(email, verificationCode = null) {
    if (!wallet) {
      throw new Error("Wallet not initialized. Please try again.");
    }
    try {
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
      const walletAccount = await withRetry(() =>
        wallet.connect({
          client: thirdwebClient,
          chain: liskSepolia,
          strategy: "email",
          email,
          verificationCode,
        })
      );
      const rpcUrl = liskSepolia.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(4202);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 4202);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Lisk Sepolia. Insufficient gas funds (requires ETH).`;
      }
      console.error("Error connecting with email:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

  // Login with Phone Number
  async function connectWithPhone(phoneNumber, verificationCode = null) {
    if (!wallet) {
      throw new Error("Wallet not initialized. Please try again.");
    }
    try {
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
      const walletAccount = await withRetry(() =>
        wallet.connect({
          client: thirdwebClient,
          chain: liskSepolia,
          strategy: "phone",
          phoneNumber,
          verificationCode,
        })
      );
      const rpcUrl = liskSepolia.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(4202);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 4202);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Lisk Sepolia. Insufficient gas funds (requires ETH).`;
      }
      console.error("Error connecting with phone:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

  // Login with Passkey
  async function connectWithPasskey() {
    if (!wallet) {
      throw new Error("Wallet not initialized. Please try again.");
    }
    try {
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
        walletAccount = await withRetry(() =>
          authenticate({
            client: thirdwebClient,
            strategy: "passkey",
            type: "sign-in",
          })
        );
      }
      const rpcUrl = liskSepolia.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(4202);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 4202);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Lisk Sepolia. Insufficient gas funds (requires ETH).`;
      }
      console.error("Error connecting with passkey:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

  // Connect to a Guest Account
  async function connectAsGuest() {
    if (!wallet) {
      throw new Error("Wallet not initialized. Please try again.");
    }
    try {
      const walletAccount = await withRetry(() =>
        wallet.connect({
          client: thirdwebClient,
          chain: liskSepolia,
          strategy: "guest",
        })
      );
      const rpcUrl = liskSepolia.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(4202);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 4202);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Lisk Sepolia. Insufficient gas funds (requires ETH).`;
      }
      console.error("Error connecting as guest:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

  // Login with SIWE (e.g., Rabby)
  async function connectWithSIWE() {
    if (!wallet) {
      throw new Error("Wallet not initialized. Please try again.");
    }
    try {
      const rabby = createWallet("io.rabby");
      const walletAccount = await withRetry(() =>
        wallet.connect({
          client: thirdwebClient,
          chain: liskSepolia,
          strategy: "wallet",
          wallet: rabby,
        })
      );
      const rpcUrl = liskSepolia.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(4202);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 4202);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Lisk Sepolia. Insufficient gas funds (requires ETH).`;
      }
      console.error("Error connecting with SIWE:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

  // Unified connectInAppWallet function
  async function connectInAppWallet(strategy, options = {}) {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      setConnectionStrategy(strategy);
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
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }

  // MetaMask connect function
  async function connect() {
    if (typeof window === "undefined" || !window.ethereum) {
      setConnectionError("Please install MetaMask to use this app.");
      toast.error("Please install MetaMask to use this app.");
      throw new Error("Please install MetaMask to use this app.");
    }

    setIsConnecting(true);
    setConnectionError(null);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found. Please unlock MetaMask.");
      }

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
                  chainName: SUPPORTED_CHAINS[defaultChainId].chainName,
                  nativeCurrency: SUPPORTED_CHAINS[defaultChainId].nativeCurrency,
                  rpcUrls: SUPPORTED_CHAINS[defaultChainId].rpcUrls,
                  blockExplorerUrls: SUPPORTED_CHAINS[defaultChainId].blockExplorerUrls,
                },
              ],
            });
          } else {
            setConnectionError("Failed to switch to a supported network. Please switch manually.");
            toast.error("Please switch to Lisk Sepolia");
            throw new Error("Failed to switch network.");
          }
        }
        const newNetwork = await browserProvider.getNetwork();
        setChainId(Number(newNetwork.chainId));
      } else {
        setChainId(currentChainId);
      }

      const userSigner = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(userSigner);
      setAccount(accounts[0]);
      setWalletType("eoa");
      setConnectionStrategy("metamask");
      await debouncedFetchBalance(accounts[0], browserProvider, currentChainId);
      toast.success("Connected to MetaMask");
    } catch (error) {
      console.error("Error connecting to MetaMask:", error);
      setConnectionError(error.message || "Failed to connect to MetaMask.");
      toast.error(error.message || "Failed to connect to MetaMask.");
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }

  // Switch network function
  async function switchNetwork(targetChainId) {
    if (!SUPPORTED_CHAINS[targetChainId]) {
      throw new Error(`Unsupported chain ID: ${targetChainId}`);
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (walletType === "smart" && targetChainId === 44787) {
        throw new Error("Smart Wallet is not supported on Celo Alfajores for now.");
      }

      if (walletType === "eoa" && typeof window !== "undefined" && window.ethereum) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${targetChainId.toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${targetChainId.toString(16)}`,
                  chainName: SUPPORTED_CHAINS[targetChainId].chainName,
                  nativeCurrency: SUPPORTED_CHAINS[targetChainId].nativeCurrency,
                  rpcUrls: SUPPORTED_CHAINS[targetChainId].rpcUrls,
                  blockExplorerUrls: SUPPORTED_CHAINS[targetChainId].blockExplorerUrls,
                },
              ],
            });
          } else {
            throw new Error("Failed to switch network in MetaMask.");
          }
        }

        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        const userSigner = await browserProvider.getSigner();
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

        setProvider(browserProvider);
        setSigner(userSigner);
        setAccount(accounts[0]);
        setChainId(targetChainId);
        await debouncedFetchBalance(accounts[0], browserProvider, targetChainId);
        toast.success(`Switched to ${SUPPORTED_CHAINS[targetChainId].chainName}`);
      } else if (walletType === "smart") {
        const targetChain = chainConfigs[targetChainId];
        if (!targetChain) {
          throw new Error(`No chain configuration found for chain ID: ${targetChainId}`);
        }

        if (!wallet) {
          throw new Error("Wallet not initialized. Please reconnect.");
        }

        const walletAccount = await wallet.connect({
          client: thirdwebClient,
          chain: targetChain,
          strategy: connectionStrategy || "wallet",
        });

        const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrls[targetChainId]);
        setProvider(jsonRpcProvider);
        setSigner(walletAccount);
        setAccount(walletAccount.address);
        setChainId(targetChainId);
        await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, targetChainId);
        toast.success(`Switched to ${SUPPORTED_CHAINS[targetChainId].chainName}`);
      } else {
        throw new Error("No wallet connected. Please connect a wallet first.");
      }
    } catch (error) {
      console.error("Error switching network:", error);
      setConnectionError(error.message);
      toast.error(`Failed to switch network: ${error.message}`);
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
    setBalance(null);
    setConnectionError(null);
    setConnectionStrategy(null);
    if (wallet) {
      wallet.disconnect();
    }
    toast.info("Disconnected from wallet");
  }

  // Effect for MetaMask account and chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (account !== accounts[0]) {
        await connect();
      }
    };

    const handleChainChanged = async (newChainIdHex) => {
      const newChainId = parseInt(newChainIdHex, 16);
      if (SUPPORTED_CHAINS[newChainId] && walletType === "eoa") {
        try {
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          const userSigner = await browserProvider.getSigner();
          const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

          setProvider(browserProvider);
          setSigner(userSigner);
          setAccount(accounts[0]);
          setChainId(newChainId);
          await debouncedFetchBalance(accounts[0], browserProvider, newChainId);
          toast.info(`Network changed to ${SUPPORTED_CHAINS[newChainId].chainName}`);
        } catch (error) {
          console.error("Error handling chain change:", error);
          setConnectionError(error.message);
          toast.error(`Failed to update network: ${error.message}`);
        }
      } else {
        disconnect();
        toast.error("Unsupported network detected. Please switch to Lisk Sepolia or Celo Alfajores.");
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
  }, [account, walletType]);

  // Effect to refetch balance on account or chainId change
  useEffect(() => {
    debouncedFetchBalance(account, provider, chainId);
    return () => debouncedFetchBalance.cancel();
  }, [account, chainId, provider]);

  // Set initialized after component mounts
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Log context value for debugging
  useEffect(() => {
    console.log("Web3Context value:", {
      provider: !!provider,
      signer: !!signer,
      account,
      chainId,
      walletType,
      balance,
      connect: !!connect,
      connectInAppWallet: !!connectInAppWallet,
      disconnect: !!disconnect,
      switchNetwork: !!switchNetwork,
      isConnecting,
      isInitialized,
      thirdwebClient: !!thirdwebClient,
    });
  }, [provider, signer, account, chainId, walletType, balance, isConnecting, isInitialized]);

  // Fallback UI if not initialized
  if (!isInitialized) {
    return <div className="flex justify-center items-center h-screen">Loading Web3 Provider...</div>;
  }

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        account,
        chainId,
        walletType,
        balance,
        connect,
        connectInAppWallet,
        disconnect,
        isConnecting,
        isInitialized,
        switchNetwork,
        thirdwebClient,
        liskSepolia,
        // celoAlfajores,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context || !context.isInitialized) {
    throw new Error("useWeb3 must be used within an initialized Web3Provider");
  }
  return context;
}

// Helper to get chain name for error messages
function getChainName(chainId) {
  switch (chainId) {
    case 4202:
      return "Lisk Sepolia";
    default:
      return `Unknown Chain (${chainId || "Not Connected"})`;
  }
}