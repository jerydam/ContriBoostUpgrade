// components/self-verification-flow.jsx

"use client";

import { useState, useEffect } from 'react';
import { Card, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Smartphone, QrCode, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SelfQRcodeWrapper, getUniversalLink } from "@selfxyz/qrcode"; // <-- ADDED getUniversalLink
import { toast } from "react-toastify";

const BUTTON_STYLE_CLASSES = "border-2 border-amber-50 transition-all hover:scale-[1.02] active:scale-[0.98]";

/**
 * Custom hook to detect if the screen size indicates a mobile device.
 * Uses a media query for width.
 */
const useIsMobile = (breakpoint = 768) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const checkMobile = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };

        // Initial check and set listener
        checkMobile();
        window.addEventListener('resize', checkMobile);

        return () => window.removeEventListener('resize', checkMobile);
    }, [breakpoint]);

    return isMobile;
};


/**
 * SelfVerificationFlow component displays the QR code or a Deep Link button.
 */
export default function SelfVerificationFlow({ selfApp, onSuccess, onCancel, isFlowOpen, isAppLoading }) {
    
    // Check if the user is on a mobile-sized screen
    const isMobile = useIsMobile();
    const [universalLink, setUniversalLink] = useState('');

    useEffect(() => {
        if (selfApp) {
            // Generate the deep link URL once the SelfApp object is ready
            try {
                setUniversalLink(getUniversalLink(selfApp));
            } catch (e) {
                console.error("Failed to generate universal link:", e);
            }
        }
    }, [selfApp]);


    if (!isFlowOpen) return null;

    if (isAppLoading) {
        return (
             <Card className="p-6 mt-4 max-w-sm mx-auto flex justify-center items-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Initializing Verification...</span>
            </Card>
        );
    }

    const handleOpenSelfApp = () => {
        if (universalLink) {
            // Open the deep link in a new tab/window
            window.open(universalLink, '_blank');
        } else {
            toast.error("Verification link not ready.");
        }
    };

    const VerificationContent = () => (
        <CardContent className="p-0">
            <div className="flex flex-col items-center space-y-4">
                {isMobile ? (
                    // --- MOBILE VIEW: Deep Link Button ---
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
                    // --- DESKTOP VIEW: QR Code ---
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
            <Card className="p-6 mt-4 max-w-sm mx-auto relative">
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