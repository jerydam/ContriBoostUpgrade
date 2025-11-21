"use client";

import { useState, useEffect } from 'react';
import { Card, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Smartphone, QrCode, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
// 1. Import the hook here so this component is self-contained
import { useSelfApp } from "@selfxyz/react"; 
import { SelfQRcodeWrapper, getUniversalLink } from "@selfxyz/qrcode";
import { toast } from "react-toastify";

const BUTTON_STYLE_CLASSES = "border-2 border-amber-50 transition-all hover:scale-[1.02] active:scale-[0.98]";

// --- CONFIGURATION (FIXED) ---
const SELF_CONFIG = {
    scope: "contriboost",
    // CRITICAL FIX: Point to the API route, not the homepage
    endpoint: "https://www.contriboost.xyz/api/verify", 
    // CRITICAL FIX: Must be 'staging' to match your backend (true)
    mode: "staging", 
    userIdType: "hex",
};

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
 * Now handles the connection logic internally.
 * Removed 'selfApp' and 'isAppLoading' from props since we generate them here.
 */
export default function SelfVerificationFlow({ onSuccess, onCancel, isFlowOpen }) {
    
    // 2. Initialize the SDK directly inside this component
    const { selfApp, isLoading: isAppLoading, error } = useSelfApp(SELF_CONFIG);

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

    // 3. If the hook encounters an error (e.g. network issues), log it
    useEffect(() => {
        if (error) {
            console.error("Self SDK Error:", error);
            toast.error("Failed to initialize identity system.");
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
                        <p className="text-sm text-muted-foreground pt-2">
                            *This will open the Self app directly.*
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
                                toast.error(e.reason || "Verification failed. Please try again.");
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
                        <AlertDescription>Verification initialization failed.</AlertDescription>
                    </Alert>
                )}
            </Card>
        </div>
    );
}