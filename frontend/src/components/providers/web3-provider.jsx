"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";
import { inAppWallet, preAuthenticate, authenticate, createWallet } from "thirdweb/wallets";
import { createThirdwebClient, defineChain } from "thirdweb";
import { debounce } from "lodash";
import { toast } from "react-toastify";

const thirdwebClient = createThirdwebClient({
  clientId: "6e1030a6daf38282ebfbe2b7e42ee6a6",
  gasless: {
    biconomy: {
      apiKey: process.env.API_KEY,
      apiId: process.env.API_ID,
      url: `https://paymaster.biconomy.io/api/v1/44787/${process.env.API_KEY}`,
    },
  },
});

const celoAlfajores = defineChain({
  id: 44787,
  name: "Celo Alfajores Testnet",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpc: ["https://alfajores-forno.celo-testnet.org"],
  blockExplorers: [{ name: "Celo Explorer", url: "https://alfajores-blockscout.celo-testnet.org" }],
  testnet: true,
});

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
  celoAlfajores: null,
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

  const chainConfigs = {
    44787: celoAlfajores,
  };

  const rpcUrls = {
    44787: "https://alfajores-forno.celo-testnet.org",
  };

  async function withRetry(fn, maxRetries = 2, delay = 1000) {
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
        setBalance(`${parseFloat(balanceEther).toFixed(4)} CELO`);
        setLastBlockNumber(currentBlock);
      }
    } catch (error) {
      console.error("Error fetching balance:", error.message);
      setBalance("Error fetching balance");
    }
  }, 1000);

  useEffect(() => {
    const newWallet = inAppWallet({
      smartAccount: {
        chain: celoAlfajores,
        sponsorGas: true,
        factoryAddress: "0xYOUR_FACTORY_ADDRESS_HERE",
      },
      auth: {
        mode: "popup",
        options: ["google", "email", "phone", "passkey", "guest", "wallet"],
        defaultSmsCountryCode: "+1",
        passkeyDomain: typeof window !== "undefined" ? window.location.hostname : "localhost",
      },
      hidePrivateKeyExport: false,
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

  async function connect() {
    if (typeof window === "undefined" || !window.ethereum) {
      const errorMsg = "MetaMask is not installed or not available. Please install MetaMask.";
      setConnectionError(errorMsg);
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (!window.ethereum.isMetaMask) {
      const errorMsg = "Detected wallet is not MetaMask. Please ensure MetaMask is active.";
      setConnectionError(errorMsg);
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        const errorMsg = "No accounts found. Please unlock MetaMask or connect an account.";
        setConnectionError(errorMsg);
        toast.error(errorMsg);
        throw new Error(errorMsg);
      }

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await withRetry(() => browserProvider.getNetwork());
      const currentChainId = Number(network.chainId);

      if (currentChainId !== 44787) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${(44787).toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: `0x${(44787).toString(16)}`,
                    chainName: "Celo Alfajores Testnet",
                    nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
                    rpcUrls: ["https://alfajores-forno.celo-testnet.org"],
                    blockExplorerUrls: ["https://alfajores-blockscout.celo-testnet.org"],
                  },
                ],
              });
            } catch (addError) {
              const errorMsg = `Failed to add Celo Alfajores network: ${addError.message}`;
              setConnectionError(errorMsg);
              toast.error(errorMsg);
              throw new Error(errorMsg);
            }
          } else {
            const errorMsg = "Failed to switch to Celo Alfajores. Please switch manually in MetaMask.";
            setConnectionError(errorMsg);
            toast.error(errorMsg);
            throw new Error(errorMsg);
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
      const errorMsg = error.message || "Failed to connect to MetaMask.";
      setConnectionError(errorMsg);
      toast.error(errorMsg);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }

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
          chain: celoAlfajores,
          strategy: "email",
          email,
          verificationCode,
        })
      );
      const rpcUrl = celoAlfajores.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(44787);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 44787);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Celo Alfajores. Insufficient gas funds (requires CELO).`;
      }
      console.error("Error connecting with email:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

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
          chain: celoAlfajores,
          strategy: "phone",
          phoneNumber,
          verificationCode,
        })
      );
      const rpcUrl = celoAlfajores.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(44787);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 44787);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Celo Alfajores. Insufficient gas funds (requires CELO).`;
      }
      console.error("Error connecting with phone:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

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
      const rpcUrl = celoAlfajores.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(44787);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 44787);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Celo Alfajores. Insufficient gas funds (requires CELO).`;
      }
      console.error("Error connecting with passkey:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

  async function connectAsGuest() {
    if (!wallet) {
      throw new Error("Wallet not initialized. Please try again.");
    }
    try {
      const walletAccount = await withRetry(() =>
        wallet.connect({
          client: thirdwebClient,
          chain: celoAlfajores,
          strategy: "guest",
        })
      );
      const rpcUrl = celoAlfajores.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(44787);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 44787);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Celo Alfajores. Insufficient gas funds (requires CELO).`;
      }
      console.error("Error connecting as guest:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

  async function connectWithSIWE() {
    if (!wallet) {
      throw new Error("Wallet not initialized. Please try again.");
    }
    try {
      const rabby = createWallet("io.rabby");
      const walletAccount = await withRetry(() =>
        wallet.connect({
          client: thirdwebClient,
          chain: celoAlfajores,
          strategy: "wallet",
          wallet: rabby,
        })
      );
      const rpcUrl = celoAlfajores.rpc[0];
      const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      setProvider(jsonRpcProvider);
      setSigner(walletAccount);
      setAccount(walletAccount.address);
      setChainId(44787);
      setWalletType("smart");
      await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, 44787);
    } catch (error) {
      let message = error.message.includes("pop-up")
        ? "Please allow popups for this site."
        : error.message.includes("Failed to fetch")
        ? "Network error. Check your internet connection."
        : error.message;
      if (error.message.includes("insufficient funds") || error.message.includes("gas")) {
        message = `Failed to deploy wallet on Celo Alfajores. Insufficient gas funds (requires CELO).`;
      }
      console.error("Error connecting with SIWE:", error.message, error.stack);
      setConnectionError(message);
      throw new Error(message);
    }
  }

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

  async function switchNetwork(targetChainId) {
    if (targetChainId !== 44787) {
      throw new Error("Only Celo Alfajores (chain ID 44787) is supported");
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (!account) {
        await connect();
        if (!account) {
          const errorMsg = "No wallet connected. Please connect a wallet first.";
          setConnectionError(errorMsg);
          toast.warning(errorMsg);
          throw new Error(errorMsg);
        }
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
                  chainName: "Celo Alfajores Testnet",
                  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
                  rpcUrls: ["https://alfajores-forno.celo-testnet.org"],
                  blockExplorerUrls: ["https://alfajores-blockscout.celo-testnet.org"],
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
        toast.success("Switched to Celo Alfajores");
      } else if (walletType === "smart" && wallet) {
        // For smart wallets, ensure the chain is set via Thirdweb
        await wallet.switchChain(celoAlfajores);
        const walletAccount = await wallet.getAccount();
        const rpcUrl = celoAlfajores.rpc[0];
        const jsonRpcProvider = new ethers.JsonRpcProvider(rpcUrl);
        setProvider(jsonRpcProvider);
        setSigner(walletAccount);
        setAccount(walletAccount.address);
        setChainId(targetChainId);
        await debouncedFetchBalance(walletAccount.address, jsonRpcProvider, targetChainId);
        toast.success("Switched to Celo Alfajores");
      } else {
        throw new Error("Unsupported wallet type. Please connect a MetaMask or in-app wallet.");
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
      if (newChainId === 44787 && walletType === "eoa") {
        try {
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          const userSigner = await browserProvider.getSigner();
          const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

          setProvider(browserProvider);
          setSigner(userSigner);
          setAccount(accounts[0]);
          setChainId(newChainId);
          await debouncedFetchBalance(accounts[0], browserProvider, newChainId);
          toast.info("Network changed to Celo Alfajores");
        } catch (error) {
          console.error("Error handling chain change:", error);
          setConnectionError(error.message);
          toast.error(`Failed to update network: ${error.message}`);
        }
      } else {
        disconnect();
        toast.error("Unsupported network detected. Please switch to Celo Alfajores.");
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

  useEffect(() => {
    debouncedFetchBalance(account, provider, chainId);
    return () => debouncedFetchBalance.cancel();
  }, [account, chainId, provider]);

  useEffect(() => {
    setIsInitialized(true);
  }, []);

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
      celoAlfajores: !!celoAlfajores,
    });
  }, [provider, signer, account, chainId, walletType, balance, isConnecting, isInitialized]);

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
        celoAlfajores,
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