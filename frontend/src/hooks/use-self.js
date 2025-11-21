// hooks/use-self-verification.js

"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { 
    SelfAppBuilder, 
    countries 
} from "@selfxyz/qrcode";

// --- SELF CONFIGURATION PLACEHOLDERS ---
const SELF_APP_NAME = "Contriboost App";
const SELF_SCOPE = "contriboost";
// This is the relative URL to your Next.js backend API Route
const SELF_ENDPOINT = "/api/verify"; 
const SELF_LOGO_URL = "https://i.postimg.cc/mrmVf9hm/self.png";
// ---------------------------------------------------

export const useSelfVerification = (account, contractAddress, joinAction) => {
    const [isVerified, setIsVerified] = useState(false);
    const [isFlowOpen, setIsFlowOpen] = useState(false);
    const [selfApp, setSelfApp] = useState(null);
    const [isAppLoading, setIsAppLoading] = useState(true);

    // 1. Initialize SelfApp
    useEffect(() => {
        if (!account || !contractAddress) return;
        
        setIsAppLoading(true);

        try {
            // Self requires the absolute public URL for the endpoint
            const endpointUrl = "https://www.contriboost.xyz/";
            
            const app = new SelfAppBuilder({
                version: 2,
                appName: SELF_APP_NAME, 
                scope: SELF_SCOPE,
                endpoint: endpointUrl, 
                logoBase64: SELF_LOGO_URL, 
                userId: account, 
                endpointType: "staging_https", // Use staging for development
                userIdType: "hex", // Assuming account is an EVM address
                userDefinedData: contractAddress, // Contextual data
                disclosures: {
                    // Minimal verification requirements (must match your backend's VerificationConfig)
                    minimumAge: 15, 
                    nationality: true,
                }
            }).build();

            setSelfApp(app);
            setIsAppLoading(false);
        } catch (error) {
            console.error("Failed to initialize Self app builder:", error);
            setIsAppLoading(false);
            toast.error("Error setting up verification flow.");
        }
    }, [account, contractAddress]);

    // 2. Handlers
    const startVerification = useCallback(() => {
        if (!isVerified) {
            setIsFlowOpen(true);
        }
    }, [isVerified]);
    
    const cancelVerification = useCallback(() => {
        setIsFlowOpen(false);
    }, []);

    const handleSuccess = useCallback(() => {
        setIsVerified(true);
        setIsFlowOpen(false);
        toast.success("Identity verified successfully! Proceeding to join...");
        // Execute the join transaction passed from the parent page
        if (joinAction) {
            joinAction();
        }
    }, [joinAction]);

    return {
        isVerified,
        isFlowOpen,
        selfApp,
        isAppLoading,
        startVerification,
        cancelVerification,
        handleSuccess,
        resetVerification: () => setIsVerified(false),
    };
};