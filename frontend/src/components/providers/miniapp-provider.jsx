"use client";

import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export default function MiniAppProvider({ children }) {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);

  useEffect(() => {
    const initSDK = async () => {
      try {
        // Initialize the SDK
        // This hides the splash screen after the app loads
        await sdk.actions.ready();
        setIsSDKLoaded(true);
      } catch (error) {
        console.error("Failed to initialize Farcaster SDK:", error);
      }
    };

    initSDK();
  }, []);

  return <>{children}</>;
}