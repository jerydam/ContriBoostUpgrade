// pages/auth-callback.jsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { inAppWallet } from "thirdweb/wallets";
import { createThirdwebClient } from "thirdweb";
import { useWeb3 } from "@/components/providers/web3-provider";
import { toast } from "react-toastify";

const thirdwebClient = createThirdwebClient({ clientId: "b81c12c8d9ae57479a26c52be1d198eb" });

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connectInAppWallet } = useWeb3();

  useEffect(() => {
    const handleCallback = async () => {
      const authProvider = searchParams.get("authProvider");
      const authResult = searchParams.get("authResult");

      if (authProvider && authResult) {
        try {
          const result = JSON.parse(decodeURIComponent(authResult));
          const { storedToken } = result;

          if (storedToken.authProvider === "Google_v2") {
            await connectInAppWallet("google", {
              jwt: storedToken.jwtToken,
            });
            toast.success("Google login successful!");
          } else {
            console.error("Unsupported auth provider:", storedToken.authProvider);
            toast.error("Unsupported authentication provider");
          }

          router.push("/");
        } catch (error) {
          console.error("Error processing auth callback:", error);
          toast.error(`Authentication failed: ${error.message}`);
          router.push("/?error=auth_failed");
        }
      } else {
        toast.error("Invalid callback parameters");
        router.push("/?error=invalid_callback");
      }
    };

    handleCallback();
  }, [searchParams, router, connectInAppWallet]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>Processing authentication...</p>
    </div>
  );
}