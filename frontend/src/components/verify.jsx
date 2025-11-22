"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Smartphone, QrCode, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSelfApp } from "@selfxyz/react"; 
import { SelfQRcodeWrapper, getUniversalLink } from "@selfxyz/qrcode";
import { toast } from "react-toastify";

const BUTTON_STYLE_CLASSES = "border-2 border-amber-50 transition-all hover:scale-[1.02] active:scale-[0.98]";

const useIsMobile = (breakpoint = 768) => {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const checkMobile = () => setIsMobile(window.innerWidth < breakpoint);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, [breakpoint]);
    return isMobile;
};

/**
 * Props:
 * - onSuccess: callback function
 * - onCancel: callback function
 * - isFlowOpen: boolean
 * - userAddress: string (The connected wallet address, e.g., "0x123...")
 */
export default function SelfVerificationFlow({ onSuccess, onCancel, isFlowOpen, userAddress }) {
    
    // CRITICAL FIX: Memoize config so it doesn't reload on every render
    // Added `disclosures` and `userDefinedData`
    const selfConfig = useMemo(() => ({
        scope: "contriboost",
        endpoint: "https://www.contriboost.xyz/api/verify", // Must match Backend exactly
        mode: "production", // "staging" for Mock Passports, "production" for Real
        userIdType: "hex",
        
        // 1. Tell the app WHAT to verify (Must match backend rules)
        disclosures: {
            minimumAge: 15,
            nationality: true,
            ofac: false, 
            excludedCountries: [] 
        },

        // 2. Bind the proof to the specific wallet address
        // If userAddress is null, we send a zero address to prevent crash
        userDefinedData: userAddress || "0x0000000000000000000000000000000000000000", 
    }), [userAddress]);

    const { selfApp, isLoading: isAppLoading, error } = useSelfApp(selfConfig);

    const isMobile = useIsMobile();
    const [universalLink, setUniversalLink] = useState('');

    useEffect(() => {
        if (selfApp) {
            try {
                setUniversalLink(getUniversalLink(selfApp));
            } catch (e) {
                console.error("Failed to generate universal link:", e);
            }
        }
    }, [selfApp]);

    useEffect(() => {
        if (error) {
            console.error("Self SDK Error:", error);
            // Don't show toast immediately on mount, only if persistent error
            if (error.code !== 'ERR_NETWORK') toast.error("Identity system error: " + error.message);
        }
    }, [error]);

    if (!isFlowOpen) return null;

    if (isAppLoading) {
        return (
             <Card className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 max-w-sm w-full flex justify-center items-center h-48 bg-white shadow-xl">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Initializing Verification...</span>
            </Card>
        );
    }

    const handleOpenSelfApp = () => {
        if (universalLink) {
            window.open(universalLink, '_blank');
        } else {
            toast.error("Verification link not ready.");
        }
    };

    const VerificationContent = () => (
        <CardContent className="p-0">
            <div className="flex flex-col items-center space-y-4">
                {isMobile ? (
                    // --- MOBILE VIEW ---
                    <div className="flex flex-col items-center space-y-3 w-full">
                        <Smartphone className="h-10 w-10 text-primary mb-2" />
                        <Button 
                            onClick={handleOpenSelfApp}
                            disabled={!universalLink}
                            className={`min-w-[120px] ${BUTTON_STYLE_CLASSES}`}
                        >
                            Open Self App to Verify
                        </Button>
                        <p className="text-sm text-muted-foreground pt-2 text-center">
                            Tap above to open the Self App and prove you are human.
                        </p>
                    </div>
                ) : (
                    // --- DESKTOP VIEW ---
                    <div className="flex flex-col items-center">
                         <QrCode className="h-6 w-6 text-muted-foreground mb-2" />
                         <p className="text-sm text-muted-foreground mb-3">Scan with your Self mobile app:</p>
                        <SelfQRcodeWrapper
                            selfApp={selfApp}
                            onSuccess={onSuccess}
                            onError={(e) => {
                                console.error("Self Verification Error:", e);
                                // The app sends generic error codes often, check logs for specifics
                                toast.error("Verification failed. Please ensure you meet the requirements.");
                            }}
                            size={256}
                        />
                    </div>
                )}
                
                <Button 
                    variant="outline" 
                    onClick={onCancel}
                    className={BUTTON_STYLE_CLASSES}
                >
                    Cancel
                </Button>
            </div>
        </CardContent>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <Card className="p-6 mt-4 max-w-sm mx-auto relative w-full bg-white">
                <button
                    onClick={onCancel}
                    className="absolute top-2 right-2 text-gray-500 hover:text-gray-900 z-10 p-2 rounded-full"
                    aria-label="Close verification"
                >
                    <X className="h-6 w-6" />
                </button>
                <CardTitle className="mb-2 text-xl">Identity Verification</CardTitle>
                <CardDescription className="mb-4">
                    Prove your identity to join the Contriboost Circle.
                </CardDescription>
                {selfApp ? <VerificationContent /> : (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                            Failed to load QR code. Please check your internet connection.
                        </AlertDescription>
                    </Alert>
                )}
            </Card>
        </div>
    );
}