"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

const MiniAppContext = createContext({
  isSDKLoaded: false,
  isMiniApp: false,
});

export function MiniAppProvider({ children }) {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [isMiniApp, setIsMiniApp] = useState(false);

  useEffect(() => {
    const initSDK = async () => {
      try {
        // First check if we're in a miniapp context
        const inMiniApp = await sdk.isInMiniApp();
        setIsMiniApp(inMiniApp);

        if (inMiniApp) {
          // Only call ready() if we're actually in a miniapp
          await sdk.actions.ready();
          console.log("Farcaster SDK initialized successfully");
        }
        
        setIsSDKLoaded(true);
      } catch (error) {
        console.error("Failed to initialize Farcaster SDK:", error);
        setIsSDKLoaded(true); // Set to true anyway to not block the app
      }
    };

    initSDK();
  }, []);

  // Show loading state while SDK initializes
  if (!isSDKLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <MiniAppContext.Provider value={{ isSDKLoaded, isMiniApp }}>
      {children}
    </MiniAppContext.Provider>
  );
}

export function useMiniApp() {
  return useContext(MiniAppContext);
}