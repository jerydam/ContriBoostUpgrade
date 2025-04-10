"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { ethers } from "ethers"

const Web3Context = createContext({
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  connect: async () => {},
  disconnect: () => {},
  isConnecting: false,
})

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    // Check if we're in browser environment
    if (typeof window === "undefined") return

    // Check for existing connection
    const checkConnection = async () => {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: "eth_accounts" })
        if (accounts.length > 0) {
          await connect()
        }
      }
    }

    checkConnection()
  }, [])

  // Set up event listeners for wallet events
  useEffect(() => {
    if (!window.ethereum) return

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        // User disconnected their wallet
        disconnect()
      } else if (account !== accounts[0]) {
        // Set up new account connection
        await connect()
      }
    }

    const handleChainChanged = () => {
      window.location.reload()
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged)
    window.ethereum.on("chainChanged", handleChainChanged)

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged)
        window.ethereum.removeListener("chainChanged", handleChainChanged)
      }
    }
  }, [account])

  const connect = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask to use this app")
      return
    }

    setIsConnecting(true)

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" })
      const userSigner = await browserProvider.getSigner()
      const network = await browserProvider.getNetwork()

      setProvider(browserProvider)
      setSigner(userSigner)
      setAccount(accounts[0])
      setChainId(Number(network.chainId))
    } catch (error) {
      console.error("Error connecting to wallet:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnect = () => {
    setProvider(null)
    setSigner(null)
    setAccount(null)
    setChainId(null)
  }

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
  )
}

export function useWeb3() {
  return useContext(Web3Context)
}
