import { initiateLogin, getSocialValidator, isAuthorized, logout } from "@zerodev/social-validator";
import { createKernelAccount, createKernelClient, getECDSAValidator } from "@zerodev/sdk";
import { http, createPublicClient } from "viem";

export class SocialWalletConnector {
  constructor({ chains, ecdsaProvider = null }) {
    this.id = "social-wallet-connector";
    this.name = ecdsaProvider ? "Social Wallet (ECDSA)" : "Social Wallet (Google)";
    this.chains = chains;
    this.projectId = process.env.NEXT_PUBLIC_ZERO_DEV_PROJECT_ID;
    this.eventListeners = new Map();
    this.ecdsaProvider = ecdsaProvider; // Optional ECDSA provider (e.g., a signer or private key)
  }

  async connect() {
    try {
      let kernelAccount, publicClient, kernelClient;

      // Create a public client for the chain
      publicClient = createPublicClient({
        chain: this.chains[0],
        transport: http(`https://lisk-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
      });

      if (this.ecdsaProvider) {
        // ECDSA-based account creation
        const ecdsaValidator = await getECDSAValidator(publicClient, {
          signer: this.ecdsaProvider, // Assuming ecdsaProvider is a valid signer
          entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // Updated for v0.7
          kernelVersion: "0.3.2",
        });

        kernelAccount = await createKernelAccount(publicClient, {
          plugins: {
            sudo: ecdsaValidator,
          },
          projectId: this.projectId,
        });
      } else {
        // Social login-based account creation
        await initiateLogin({
          socialProvider: "google",
          projectId: this.projectId,
          oauthCallbackUrl: window.location.href,
        });

        const authorized = await isAuthorized({ projectId: this.projectId });
        if (!authorized) {
          throw new Error("Social login failed or user not authorized");
        }

        const socialValidator = await getSocialValidator(publicClient, {
          entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
          projectId: this.projectId,
          kernelVersion: "0.3.2",
        });

        kernelAccount = await createKernelAccount(publicClient, {
          plugins: {
            sudo: socialValidator,
          },
          projectId: this.projectId,
        });
      }

      // Create Kernel client
      kernelClient = createKernelClient({
        account: kernelAccount,
        chain: this.chains[0],
        transport: http(`https://lisk-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
      });

      const address = kernelAccount.address;
      return {
        account: address,
        chain: { id: this.chains[0].id, unsupported: false },
        provider: kernelClient,
      };
    } catch (error) {
      throw new Error(`Failed to connect with wallet: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      if (!this.ecdsaProvider) {
        // Only call logout for social login
        await logout({ projectId: this.projectId });
      }
      this.provider = null;
    } catch (error) {
      console.error("Error during logout:", error);
    }
  }

  async getAccount() {
    const provider = await this.getProvider();
    return provider.account.address;
  }

  async getProvider() {
    if (!this.provider) {
      const publicClient = createPublicClient({
        chain: this.chains[0],
        transport: http(`https://lisk-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
      });

      let kernelAccount;

      if (this.ecdsaProvider) {
        // ECDSA-based account creation
        const ecdsaValidator = await getECDSAValidator(publicClient, {
          signer: this.ecdsaProvider,
          entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
          kernelVersion: "0.3.2",
        });

        kernelAccount = await createKernelAccount(publicClient, {
          plugins: {
            sudo: ecdsaValidator,
          },
          projectId: this.projectId,
        });
      } else {
        // Social login-based account creation
        const socialValidator = await getSocialValidator(publicClient, {
          entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
          projectId: this.projectId,
          kernelVersion: "0.3.2",
        });

        kernelAccount = await createKernelAccount(publicClient, {
          plugins: {
            sudo: socialValidator,
          },
          projectId: this.projectId,
        });
      }

      this.provider = createKernelClient({
        account: kernelAccount,
        chain: this.chains[0],
        transport: http(`https://lisk-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
      });
    }
    return this.provider;
  }

  async getChainId() {
    const provider = await this.getProvider();
    return provider.chain.id;
  }

  async switchChain(chainId) {
    const chain = this.chains.find((c) => c.id === chainId);
    if (!chain) {
      throw new Error("Chain not supported");
    }
    this.provider = null;
    return chain;
  }

  on(event, listener) {
    this.eventListeners.set(event, listener);
    return this;
  }

  off(event) {
    this.eventListeners.delete(event);
    return this;
  }

  removeListener(event) {
    this.eventListeners.delete(event);
    return this;
  }
}